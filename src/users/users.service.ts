import {
  BadRequestException, Injectable, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '../auth/enums/role.enum';

// Role hierarchy for permission checks
const ROLE_HIERARCHY: Role[] = [
  Role.STAFF,
  Role.MANAGER,
  Role.CLIENT_ADMIN,
  Role.SUPER_ADMIN,
];

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  // Safe select — never return passwordHash
  private readonly safeSelect = {
    id: true,
    hotelName: true,
    businessType: true,
    businessLocation: true,
    kitchenCloseTime: true,
    businessEmail: true,
    contactPersonName: true,
    contactPersonMobileNumber: true,
    role: true,
    isActive: true,
    tenantId: true,
    createdAt: true,
    updatedAt: true,
  };

  async findAll() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      select: this.safeSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByTenant(tenantId: string) {
    await this.ensureTenantExists(tenantId);

    return this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      select: this.safeSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: this.safeSelect,
    });

    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async updateRole(id: string, newRole: Role, currentUser: { id: string; role: string }) {
    const target = await this.findOne(id);

    // Cannot change your own role
    if (target.id === currentUser.id) {
      throw new ForbiddenException('You cannot change your own role');
    }

    const currentUserRoleIndex = ROLE_HIERARCHY.indexOf(currentUser.role as Role);
    const targetRoleIndex = ROLE_HIERARCHY.indexOf(target.role as Role);
    const newRoleIndex = ROLE_HIERARCHY.indexOf(newRole);

    // Can only manage users with a strictly lower role
    if (targetRoleIndex >= currentUserRoleIndex) {
      throw new ForbiddenException('You cannot modify a user with equal or higher role');
    }

    // Can only assign roles strictly below your own
    if (newRoleIndex >= currentUserRoleIndex) {
      throw new ForbiddenException('You cannot assign a role equal to or higher than your own');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: newRole },
      select: this.safeSelect,
    });

    this.logger.log(
      `User ${id} role changed from ${target.role} to ${newRole} by ${currentUser.id}`,
    );

    return updated;
  }

  async updateProfile(id: string, dto: UpdateUserDto) {
    const existing = await this.findOne(id);
    const hotelName = this.optionalTrim(dto.hotelName ?? dto.hotel_name);
    const businessType = this.optionalTrim(dto.businessType ?? dto.business_type);
    const businessLocation = this.optionalTrim(
      dto.businessLocation ?? dto.business_location,
    );
    const kitchenCloseTime = this.normalizeKitchenCloseTime(
      dto.kitchenCloseTime ?? dto.kitchen_close_time,
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(hotelName && { hotelName }),
          ...(businessType && { businessType }),
          ...(businessLocation && { businessLocation }),
          ...(kitchenCloseTime && { kitchenCloseTime }),
          ...(dto.contactPersonName && { contactPersonName: dto.contactPersonName.trim() }),
          ...(dto.contactPersonMobileNumber && {
            contactPersonMobileNumber: dto.contactPersonMobileNumber.trim(),
          }),
        },
        select: this.safeSelect,
      });

      if (hotelName && existing.tenantId) {
        await tx.tenant.update({
          where: { id: existing.tenantId },
          data: { name: hotelName },
        });
      }

      return updated;
    });
  }

  async deactivate(id: string, currentUser: { id: string; role: string }) {
    if (id === currentUser.id) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }

    const target = await this.findOne(id);
    const currentUserRoleIndex = ROLE_HIERARCHY.indexOf(currentUser.role as Role);
    const targetRoleIndex = ROLE_HIERARCHY.indexOf(target.role as Role);

    if (targetRoleIndex >= currentUserRoleIndex) {
      throw new ForbiddenException('You cannot deactivate a user with equal or higher role');
    }

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: this.safeSelect,
    });
  }

  // Soft delete — never hard delete users
  async remove(id: string, currentUser: { id: string; role: string }) {
    if (id === currentUser.id) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const target = await this.findOne(id);
    const currentUserRoleIndex = ROLE_HIERARCHY.indexOf(currentUser.role as Role);
    const targetRoleIndex = ROLE_HIERARCHY.indexOf(target.role as Role);

    if (targetRoleIndex >= currentUserRoleIndex) {
      throw new ForbiddenException('You cannot delete a user with equal or higher role');
    }

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    this.logger.log(`User ${id} soft-deleted by ${currentUser.id}`);
  }

  private async ensureTenantExists(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);
    return tenant;
  }

  private optionalTrim(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed || undefined;
  }

  private normalizeKitchenCloseTime(value?: string | null) {
    const trimmed = value?.trim();
    if (!trimmed) {
      return undefined;
    }

    const candidate = trimmed.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
    const amPmMatch = candidate.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (amPmMatch) {
      const hour = Number(amPmMatch[1]);
      const minute = Number(amPmMatch[2] ?? '0');
      if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
        return `${hour}:${minute.toString().padStart(2, '0')} ${amPmMatch[3].toUpperCase()}`;
      }
    }

    const twentyFourHourMatch = candidate.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (twentyFourHourMatch) {
      const hour = Number(twentyFourHourMatch[1]);
      const minute = Number(twentyFourHourMatch[2]);
      const period = hour >= 12 ? 'PM' : 'AM';
      const twelveHour = hour % 12 || 12;
      return `${twelveHour}:${minute.toString().padStart(2, '0')} ${period}`;
    }

    throw new BadRequestException('kitchenCloseTime must be a valid time such as 11:00 PM, 11.pm, 11 pm, or 23:00');
  }
}
