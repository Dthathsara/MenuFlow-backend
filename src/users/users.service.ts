import {
  BadRequestException, Injectable, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { unlink } from 'fs/promises';
import { Prisma } from '../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateRestaurantProfileDto, UpdateUserDto } from './dto/update-user.dto';
import { Role } from '../auth/enums/role.enum';
import {
  buildRestaurantImagePublicUrl,
  resolveRestaurantImageFilePath,
} from './restaurant-image-upload.config';

// Role hierarchy for permission checks
const ROLE_HIERARCHY: Role[] = [
  Role.STAFF,
  Role.MANAGER,
  Role.CLIENT_ADMIN,
  Role.SUPER_ADMIN,
];

const BCRYPT_ROUNDS = 12;

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
    businessAddress: true,
    email: true,
    businessEmail: true,
    restaurantImageUrl: true,
    kitchenOpenTime: true,
    kitchenCloseTime: true,
    contactPersonName: true,
    contactPersonMobileNumber: true,
    taxRate: true,
    serviceChargeRate: true,
    discountRate: true,
    role: true,
    isActive: true,
    tenantId: true,
    createdAt: true,
    updatedAt: true,
  };

  private readonly accountSelect = {
    id: true,
    email: true,
    role: true,
    tenantId: true,
    contactPersonName: true,
    contactPersonMobileNumber: true,
  };

  private readonly restaurantProfileSelect = {
    id: true,
    hotelName: true,
    businessEmail: true,
    businessType: true,
    businessLocation: true,
    businessAddress: true,
    kitchenOpenTime: true,
    kitchenCloseTime: true,
    taxRate: true,
    serviceChargeRate: true,
    discountRate: true,
    restaurantImageUrl: true,
    tenantId: true,
  };

  async findAll() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      select: this.safeSelect,
      orderBy: { createdAt: 'desc' },
    });

    return users.map((user) => this.toUserResponse(user));
  }

  async findByTenant(tenantId: string) {
    await this.ensureTenantExists(tenantId);

    const users = await this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      select: this.safeSelect,
      orderBy: { createdAt: 'desc' },
    });

    return users.map((user) => this.toUserResponse(user));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: this.safeSelect,
    });

    if (!user) throw new NotFoundException(`User ${id} not found`);
    return this.toUserResponse(user);
  }

  async getAccountProfile(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: this.accountSelect,
    });

    if (!user) throw new NotFoundException(`User ${id} not found`);
    return this.toAccountProfileResponse(user);
  }

  async getRestaurantProfile(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: this.restaurantProfileSelect,
    });

    if (!user) throw new NotFoundException(`User ${id} not found`);
    return this.toRestaurantProfileResponse(user);
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

    return this.toUserResponse(updated);
  }

  async updateProfile(id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { ...this.accountSelect, passwordHash: true },
    });
    if (!existing) throw new NotFoundException(`User ${id} not found`);

    const oldPassword = this.optionalTrim(dto.oldPassword);
    const newPassword = this.optionalTrim(dto.newPassword);
    const confirmNewPassword = this.optionalTrim(dto.confirmNewPassword);

    if (newPassword) {
      if (!oldPassword) {
        throw new BadRequestException('Old password and new password are required to change password.');
      }

      if (confirmNewPassword && confirmNewPassword !== newPassword) {
        throw new BadRequestException('Confirm password does not match new password.');
      }

      const isValid = await bcrypt.compare(oldPassword, existing.passwordHash);
      if (!isValid) {
        throw new BadRequestException('Old password is incorrect');
      }
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id },
        data: {
          ...(dto.email && {
            email: dto.email.trim().toLowerCase(),
          }),
          ...(dto.contactPersonName && {
            contactPersonName: dto.contactPersonName.trim(),
          }),
          ...(dto.contactPersonMobileNumber && {
            contactPersonMobileNumber: dto.contactPersonMobileNumber.trim(),
          }),
          ...(newPassword && { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) }),
        },
        select: this.accountSelect,
      });

      return this.toAccountProfileResponse(updated);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new BadRequestException('Email already registered');
      }
      throw error;
    }
  }

  async updateRestaurantProfile(id: string, dto: UpdateRestaurantProfileDto) {
    const existing = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, tenantId: true },
    });
    if (!existing) throw new NotFoundException(`User ${id} not found`);

    const hotelName = this.optionalTrim(dto.hotelName);
    const businessEmail = dto.businessEmail?.trim().toLowerCase();
    const businessType = this.optionalTrim(dto.businessType);
    const businessLocation = this.optionalTrim(dto.businessLocation);
    const businessAddress = this.optionalTrim(dto.businessAddress);
    const kitchenOpenTime = this.optionalTrim(dto.kitchenOpenTime);
    const kitchenCloseTime = this.normalizeKitchenCloseTime(dto.kitchenCloseTime);
    const taxRate = this.optionalDecimal(dto.taxRate);
    const serviceChargeRate = this.optionalDecimal(dto.serviceChargeRate);
    const discountRate = this.optionalDecimal(dto.discountRate);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(hotelName && { hotelName }),
          ...(businessEmail && { businessEmail }),
          ...(businessType && { businessType }),
          ...(businessLocation && { businessLocation }),
          ...(businessAddress && { businessAddress }),
          ...(kitchenOpenTime && { kitchenOpenTime }),
          ...(kitchenCloseTime && { kitchenCloseTime }),
          ...(taxRate !== undefined && { taxRate }),
          ...(serviceChargeRate !== undefined && { serviceChargeRate }),
          ...(discountRate !== undefined && { discountRate }),
        },
        select: this.restaurantProfileSelect,
      });

      if (hotelName && existing.tenantId) {
        await tx.tenant.update({
          where: { id: existing.tenantId },
          data: { name: hotelName },
        });
      }

      return this.toRestaurantProfileResponse(updated);
    });
  }

  async updateRestaurantImage(id: string, file: Express.Multer.File) {
    const existing = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, restaurantImageUrl: true },
    });

    if (!existing) {
      await this.safeDeleteFile(file.path);
      throw new NotFoundException(`User ${id} not found`);
    }

    const imageUrl = buildRestaurantImagePublicUrl(file.filename);

    try {
      const updated = await this.prisma.user.update({
        where: { id },
        data: { restaurantImageUrl: imageUrl },
        select: this.safeSelect,
      });

      if (existing.restaurantImageUrl && existing.restaurantImageUrl !== imageUrl) {
        await this.safeDeletePreviousRestaurantImage(existing.restaurantImageUrl);
      }

      return this.toUserResponse(updated);
    } catch (error) {
      await this.safeDeleteFile(file.path);
      throw error;
    }
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

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: this.safeSelect,
    });

    return this.toUserResponse(updated);
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

  private optionalDecimal(value?: number | null) {
    if (value === undefined || value === null) {
      return undefined;
    }

    return new Prisma.Decimal(value);
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

  private toUserResponse(user: any) {
    return {
      id: user.id,
      email: user.email,
      businessEmail: user.businessEmail,
      hotelName: user.hotelName,
      businessType: user.businessType,
      businessLocation: user.businessLocation,
      businessAddress: user.businessAddress,
      kitchenOpenTime: user.kitchenOpenTime,
      kitchenCloseTime: user.kitchenCloseTime,
      restaurantImageUrl: user.restaurantImageUrl,
      contactPersonName: user.contactPersonName,
      contactPersonMobileNumber: user.contactPersonMobileNumber,
      taxRate: Number(user.taxRate ?? 5),
      serviceChargeRate: Number(user.serviceChargeRate ?? 3),
      discountRate: Number(user.discountRate ?? 0),
      role: user.role,
      isActive: user.isActive,
      tenantId: user.tenantId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private toAccountProfileResponse(user: any) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      contactPersonName: user.contactPersonName,
      contactPersonMobileNumber: user.contactPersonMobileNumber,
    };
  }

  private toRestaurantProfileResponse(user: any) {
    return {
      id: user.id,
      hotelName: user.hotelName,
      businessEmail: user.businessEmail,
      businessType: user.businessType,
      businessLocation: user.businessLocation,
      businessAddress: user.businessAddress,
      kitchenOpenTime: user.kitchenOpenTime,
      kitchenCloseTime: user.kitchenCloseTime,
      taxRate: Number(user.taxRate ?? 5),
      serviceChargeRate: Number(user.serviceChargeRate ?? 3),
      discountRate: Number(user.discountRate ?? 0),
      restaurantImageUrl: user.restaurantImageUrl,
    };
  }

  private async safeDeleteFile(filePath?: string) {
    if (!filePath) {
      return;
    }

    try {
      await unlink(filePath);
    } catch {
      this.logger.warn(`Failed to remove uploaded file: ${filePath}`);
    }
  }

  private async safeDeletePreviousRestaurantImage(publicUrl?: string | null) {
    if (!publicUrl) {
      return;
    }

    const filePath = resolveRestaurantImageFilePath(publicUrl);
    if (!filePath) {
      return;
    }

    await this.safeDeleteFile(filePath);
  }
}
