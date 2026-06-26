import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, StaffMember } from '../generated/client';
import { Role } from '../auth/enums/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStaffMemberDto,
  STAFF_MEMBER_ROLES,
  STAFF_MEMBER_STATUSES,
  StaffMemberRole,
  StaffMemberStatus,
} from './dto/create-staff-member.dto';
import { StaffMemberQueryDto } from './dto/staff-member-query.dto';
import { UpdateStaffMemberDto } from './dto/update-staff-member.dto';

const BCRYPT_ROUNDS = 12;

export type CurrentStaffUser = {
  id?: string;
  tenantId?: string | null;
  hotelName?: string | null;
};

type NormalizedUpdateStaffMember = {
  fullName?: string;
  role?: StaffMemberRole;
  email?: string;
  phone?: string;
  nicNumber?: string;
  address?: string;
  operationalAccess?: string | null;
  status?: StaffMemberStatus;
  password?: string;
};

type PrismaErrorWithCode = {
  code?: unknown;
  meta?: {
    target?: unknown;
  };
};

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    currentUser: CurrentStaffUser,
    query: StaffMemberQueryDto = {},
  ) {
    const tenantId = this.requireTenantId(currentUser);
    const where = this.buildWhere(tenantId, query);

    const staffMembers = await this.prisma.staffMember.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return staffMembers.map((staffMember) => this.toResponse(staffMember));
  }

  async getSummary(currentUser: CurrentStaffUser) {
    const tenantId = this.requireTenantId(currentUser);
    const baseWhere = { tenantId, deletedAt: null };

    const [totalUsers, kitchenStaff, serviceStaff, activeToday] =
      await Promise.all([
        this.prisma.staffMember.count({ where: baseWhere }),
        this.prisma.staffMember.count({
          where: { ...baseWhere, role: 'Chef' },
        }),
        this.prisma.staffMember.count({
          where: { ...baseWhere, role: { in: ['Waiter', 'Counter'] } },
        }),
        this.prisma.staffMember.count({
          where: { ...baseWhere, status: 'Active' },
        }),
      ]);

    return {
      totalUsers,
      kitchenStaff,
      serviceStaff,
      activeToday,
    };
  }

  async getRoles(currentUser: CurrentStaffUser) {
    const tenantId = this.requireTenantId(currentUser);
    const staffMembers = await this.prisma.staffMember.findMany({
      where: {
        tenantId,
        deletedAt: null,
        role: { not: '' },
      },
      select: { role: true },
      orderBy: { role: 'asc' },
    });

    const roles = this.uniqueRoles(staffMembers.map((staff) => staff.role));
    return { roles: roles.length ? roles : [...STAFF_MEMBER_ROLES] };
  }

  async findOne(id: string, currentUser: CurrentStaffUser) {
    const tenantId = this.requireTenantId(currentUser);
    const staffMember = await this.findTenantStaffMember(id, tenantId);
    return this.toResponse(staffMember);
  }

  async create(dto: CreateStaffMemberDto, currentUser: CurrentStaffUser) {
    const tenantId = this.requireTenantId(currentUser);
    const data = this.normalizeCreateDto(dto);
    await this.ensureUniqueStaffFields(tenantId, data.email, data.nicNumber);

    try {
      const staffMember = await this.prisma.$transaction(async (tx) => {
        const context = await this.getStaffAccountContext(
          tx,
          tenantId,
          currentUser,
        );
        const userId = data.password
          ? await this.createLinkedUser(tx, context, {
              email: data.email,
              password: data.password,
              fullName: data.fullName,
              phone: data.phone,
              isActive: data.status === 'Active',
            })
          : null;

        return tx.staffMember.create({
          data: {
            tenantId,
            userId,
            fullName: data.fullName,
            role: data.role,
            email: data.email,
            phone: data.phone,
            nicNumber: data.nicNumber,
            address: data.address,
            operationalAccess: data.operationalAccess,
            status: data.status,
            lastActive: data.status === 'Active' ? new Date() : null,
            createdById: currentUser.id ?? null,
          },
        });
      });

      return this.toResponse(staffMember);
    } catch (error: unknown) {
      this.handleKnownPrismaError(error);
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateStaffMemberDto,
    currentUser: CurrentStaffUser,
  ) {
    const tenantId = this.requireTenantId(currentUser);
    const existing = await this.findTenantStaffMember(id, tenantId);
    const data = this.normalizeUpdateDto(dto);
    const nextEmail = data.email ?? existing.email;
    const nextNicNumber = data.nicNumber ?? existing.nicNumber;

    await this.ensureUniqueStaffFields(
      tenantId,
      nextEmail,
      nextNicNumber,
      existing.id,
    );

    try {
      const staffMember = await this.prisma.$transaction(async (tx) => {
        let userId = existing.userId;
        const context =
          data.password || data.email || data.fullName || data.phone
            ? await this.getStaffAccountContext(tx, tenantId, currentUser)
            : null;

        if (data.password && !userId && context) {
          userId = await this.createLinkedUser(tx, context, {
            email: nextEmail,
            password: data.password,
            fullName: data.fullName ?? existing.fullName,
            phone: data.phone ?? existing.phone,
            isActive: (data.status ?? existing.status) === 'Active',
          });
        } else if (userId) {
          await tx.user.update({
            where: { id: userId },
            data: {
              ...(data.email && { email: data.email }),
              ...(data.fullName && { contactPersonName: data.fullName }),
              ...(data.phone && { contactPersonMobileNumber: data.phone }),
              ...(data.status && { isActive: data.status === 'Active' }),
              ...(data.password && {
                passwordHash: await bcrypt.hash(data.password, BCRYPT_ROUNDS),
              }),
            },
          });
        }

        return tx.staffMember.update({
          where: { id: existing.id },
          data: {
            ...(userId !== existing.userId && { userId }),
            ...this.staffUpdateData(data),
          },
        });
      });

      return this.toResponse(staffMember);
    } catch (error: unknown) {
      this.handleKnownPrismaError(error);
      throw error;
    }
  }

  async remove(id: string, currentUser: CurrentStaffUser) {
    const tenantId = this.requireTenantId(currentUser);
    const existing = await this.findTenantStaffMember(id, tenantId);
    const deletedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.staffMember.update({
        where: { id: existing.id },
        data: {
          deletedAt,
          status: 'Inactive',
        },
      });

      if (existing.userId) {
        await tx.user.update({
          where: { id: existing.userId },
          data: { isActive: false },
        });
      }
    });
  }

  private requireTenantId(currentUser: CurrentStaffUser) {
    const tenantId = currentUser?.tenantId?.trim();
    if (!currentUser?.id) {
      throw new UnauthorizedException('Current user is required.');
    }
    if (!tenantId) {
      throw new UnauthorizedException(
        'Manager account is not connected to a restaurant.',
      );
    }
    return tenantId;
  }

  private buildWhere(tenantId: string, query: StaffMemberQueryDto) {
    const where: Prisma.StaffMemberWhereInput = {
      tenantId,
      deletedAt: null,
    };

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { nicNumber: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    const role = query.role?.trim();
    if (role && role !== 'All Roles') {
      where.role = this.validateRole(role);
    }

    const status = query.status?.trim();
    if (status && status !== 'All Statuses') {
      this.validateStatus(status);
      where.status = status;
    }

    return where;
  }

  private async findTenantStaffMember(id: string, tenantId: string) {
    const staffMember = await this.prisma.staffMember.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!staffMember) {
      throw new NotFoundException('Staff member not found');
    }
    return staffMember;
  }

  private normalizeCreateDto(dto: CreateStaffMemberDto) {
    const data = {
      fullName: this.requiredTrim(dto.fullName, 'fullName'),
      role: this.validateRole(dto.role),
      email: this.requiredTrim(dto.email, 'email').toLowerCase(),
      phone: this.requiredTrim(dto.phone, 'phone'),
      nicNumber: this.requiredTrim(dto.nicNumber, 'nicNumber'),
      address: this.requiredTrim(dto.address, 'address'),
      operationalAccess: this.optionalTrimToNull(dto.operationalAccess),
      status: this.validateStatus(dto.status ?? 'Active'),
      password: this.optionalPassword(dto.password),
    };

    return data;
  }

  private normalizeUpdateDto(dto: UpdateStaffMemberDto) {
    return {
      fullName:
        dto.fullName === undefined
          ? undefined
          : this.requiredTrim(dto.fullName, 'fullName'),
      role: dto.role === undefined ? undefined : this.validateRole(dto.role),
      email:
        dto.email === undefined
          ? undefined
          : this.requiredTrim(dto.email, 'email').toLowerCase(),
      phone:
        dto.phone === undefined
          ? undefined
          : this.requiredTrim(dto.phone, 'phone'),
      nicNumber:
        dto.nicNumber === undefined
          ? undefined
          : this.requiredTrim(dto.nicNumber, 'nicNumber'),
      address:
        dto.address === undefined
          ? undefined
          : this.requiredTrim(dto.address, 'address'),
      operationalAccess:
        dto.operationalAccess === undefined
          ? undefined
          : this.optionalTrimToNull(dto.operationalAccess),
      status:
        dto.status === undefined ? undefined : this.validateStatus(dto.status),
      password: this.optionalPassword(dto.password),
    };
  }

  private staffUpdateData(data: NormalizedUpdateStaffMember) {
    return {
      ...(data.fullName && { fullName: data.fullName }),
      ...(data.role && { role: data.role }),
      ...(data.email && { email: data.email }),
      ...(data.phone && { phone: data.phone }),
      ...(data.nicNumber && { nicNumber: data.nicNumber }),
      ...(data.address && { address: data.address }),
      ...(data.operationalAccess !== undefined && {
        operationalAccess: data.operationalAccess,
      }),
      ...(data.status && {
        status: data.status,
        ...(data.status === 'Active' && { lastActive: new Date() }),
      }),
    };
  }

  private validateRole(role: string): StaffMemberRole {
    const cleaned = role?.trim().replace(/\s+/g, ' ');
    if (!cleaned) {
      throw new BadRequestException('role is required.');
    }
    return cleaned;
  }

  private validateStatus(status: string): StaffMemberStatus {
    if (!STAFF_MEMBER_STATUSES.includes(status as StaffMemberStatus)) {
      throw new BadRequestException('Invalid staff status.');
    }
    return status as StaffMemberStatus;
  }

  private requiredTrim(value: string | undefined, fieldName: string) {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new BadRequestException(`${fieldName} is required.`);
    }
    return trimmed;
  }

  private optionalPassword(value?: string) {
    const password = value?.trim();
    if (!password) {
      return undefined;
    }
    if (password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters.');
    }
    return password;
  }

  private optionalTrimToNull(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed || null;
  }

  private uniqueRoles(roles: Array<string | null | undefined>) {
    const roleMap = new Map<string, string>();
    for (const role of roles) {
      const cleaned = role?.trim().replace(/\s+/g, ' ');
      if (!cleaned) {
        continue;
      }
      roleMap.set(cleaned.toLowerCase(), cleaned);
    }
    return Array.from(roleMap.values()).sort((a, b) => a.localeCompare(b));
  }

  private async ensureUniqueStaffFields(
    tenantId: string,
    email: string,
    nicNumber: string,
    excludeId?: string,
  ) {
    const duplicateEmail = await this.prisma.staffMember.findFirst({
      where: {
        tenantId,
        email,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (duplicateEmail) {
      throw new ConflictException(
        'A staff member with this email already exists.',
      );
    }

    const duplicateNic = await this.prisma.staffMember.findFirst({
      where: {
        tenantId,
        nicNumber,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (duplicateNic) {
      throw new ConflictException(
        'A staff member with this NIC already exists.',
      );
    }
  }

  private async getStaffAccountContext(
    tx: Prisma.TransactionClient,
    tenantId: string,
    currentUser: CurrentStaffUser,
  ) {
    const [tenant, manager] = await Promise.all([
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      }),
      currentUser.id
        ? tx.user.findUnique({
            where: { id: currentUser.id },
            select: {
              hotelName: true,
              businessType: true,
              businessLocation: true,
              businessAddress: true,
              kitchenOpenTime: true,
              kitchenCloseTime: true,
              taxRate: true,
              serviceChargeRate: true,
              discountRate: true,
            },
          })
        : null,
    ]);

    return {
      tenantId,
      hotelName:
        tenant?.name ??
        manager?.hotelName ??
        currentUser.hotelName?.trim() ??
        'Restaurant',
      businessType: manager?.businessType ?? null,
      businessLocation: manager?.businessLocation ?? null,
      businessAddress: manager?.businessAddress ?? null,
      kitchenOpenTime: manager?.kitchenOpenTime ?? null,
      kitchenCloseTime: manager?.kitchenCloseTime ?? null,
      taxRate: manager?.taxRate ?? undefined,
      serviceChargeRate: manager?.serviceChargeRate ?? undefined,
      discountRate: manager?.discountRate ?? undefined,
    };
  }

  private async createLinkedUser(
    tx: Prisma.TransactionClient,
    context: Awaited<ReturnType<typeof this.getStaffAccountContext>>,
    staffData: {
      email: string;
      password: string;
      fullName: string;
      phone: string;
      isActive: boolean;
    },
  ) {
    const existingUser = await tx.user.findUnique({
      where: { email: staffData.email },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException(
        'Email already registered as a user account.',
      );
    }

    const user = await tx.user.create({
      data: {
        email: staffData.email,
        passwordHash: await bcrypt.hash(staffData.password, BCRYPT_ROUNDS),
        hotelName: context.hotelName,
        businessType: context.businessType,
        businessLocation: context.businessLocation,
        businessAddress: context.businessAddress,
        kitchenOpenTime: context.kitchenOpenTime,
        kitchenCloseTime: context.kitchenCloseTime,
        taxRate: context.taxRate,
        serviceChargeRate: context.serviceChargeRate,
        discountRate: context.discountRate,
        contactPersonName: staffData.fullName,
        contactPersonMobileNumber: staffData.phone,
        role: Role.STAFF,
        tenantId: context.tenantId,
        isActive: staffData.isActive,
      },
      select: { id: true },
    });

    return user.id;
  }

  private handleKnownPrismaError(error: unknown) {
    const prismaError = error as PrismaErrorWithCode;
    if (prismaError.code === 'P2002') {
      const rawTarget = prismaError.meta?.target;
      const target = Array.isArray(rawTarget)
        ? rawTarget.join(', ')
        : typeof rawTarget === 'string'
          ? rawTarget
          : '';
      if (target.includes('nic_number') || target.includes('nicNumber')) {
        throw new ConflictException(
          'A staff member with this NIC already exists.',
        );
      }
      throw new ConflictException(
        'A staff member with this email already exists.',
      );
    }
  }

  private toResponse(staffMember: StaffMember) {
    return {
      id: staffMember.id,
      userId: staffMember.userId ?? null,
      tenantId: staffMember.tenantId,
      fullName: staffMember.fullName,
      role: staffMember.role,
      email: staffMember.email,
      phone: staffMember.phone,
      nicNumber: staffMember.nicNumber,
      address: staffMember.address,
      operationalAccess: staffMember.operationalAccess ?? null,
      status: staffMember.status,
      lastActive: staffMember.lastActive?.toISOString() ?? null,
      createdAt: staffMember.createdAt.toISOString(),
      updatedAt: staffMember.updatedAt.toISOString(),
    };
  }
}
