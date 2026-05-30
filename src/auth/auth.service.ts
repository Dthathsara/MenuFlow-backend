import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { Prisma } from '../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto';
import { Role } from './enums/role.enum';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly profileSelect = {
    id: true,
    hotelName: true,
    businessType: true,
    businessLocation: true,
    businessAddress: true,
    kitchenOpenTime: true,
    kitchenCloseTime: true,
    businessEmail: true,
    contactPersonName: true,
    contactPersonMobileNumber: true,
    taxRate: true,
    serviceChargeRate: true,
    discountRate: true,
    role: true,
    tenantId: true,
  };

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const businessEmail = dto.businessEmail.toLowerCase().trim();
    const exists = await this.prisma.user.findUnique({ where: { businessEmail } });
    if (exists) throw new ConflictException('Business email already registered');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.createUser({
      passwordHash,
      hotelName: dto.hotelName.trim(),
      businessEmail,
      contactPersonName: dto.contactPersonName.trim(),
      contactPersonMobileNumber: dto.contactPersonMobileNumber.trim(),
    });

    this.logger.log(`New user registered: ${user.id}`);
    return this.toProfileResponse(user);
  }

  private async createUser(data: {
    passwordHash: string;
    hotelName: string;
    businessEmail: string;
    contactPersonName: string;
    contactPersonMobileNumber: string;
  }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const tenant = await this.createTenantForHotelName(tx, data.hotelName);

        return tx.user.create({
          data: {
            ...data,
            tenantId: tenant.id,
            role: Role.MANAGER,
          },
        select: {
          id: true,
          hotelName: true,
          businessType: true,
          businessLocation: true,
          businessAddress: true,
          kitchenOpenTime: true,
          kitchenCloseTime: true,
          businessEmail: true,
          contactPersonName: true,
          contactPersonMobileNumber: true,
          taxRate: true,
          serviceChargeRate: true,
          discountRate: true,
            role: true,
            tenantId: true,
          createdAt: true,
        },
        });
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Business email already registered');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const businessEmail = dto.businessEmail.toLowerCase().trim();

    try {
      const user = await this.prisma.user.findUnique({
        where: { businessEmail },
      });

      const isValid = user
        ? await bcrypt.compare(dto.password, user.passwordHash)
        : await bcrypt.compare(dto.password, '$2b$12$invalidhashfortimingattackprevention');

      if (!user || !isValid) {
        throw new UnauthorizedException('Invalid credentials');
      }
      const activeUser = await this.ensureUserHasTenant(user);

      const tokens = await this.generateTokens(
        activeUser.id,
        activeUser.businessEmail,
        activeUser.role,
        activeUser.tenantId,
      );
      this.logger.log(`User logged in: ${activeUser.id}`);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: activeUser.id,
          hotelName: activeUser.hotelName,
          businessType: activeUser.businessType,
          businessLocation: activeUser.businessLocation,
          businessAddress: activeUser.businessAddress,
          kitchenOpenTime: activeUser.kitchenOpenTime,
          kitchenCloseTime: activeUser.kitchenCloseTime,
          businessEmail: activeUser.businessEmail,
          contactPersonName: activeUser.contactPersonName,
          contactPersonMobileNumber: activeUser.contactPersonMobileNumber,
          taxRate: Number(activeUser.taxRate ?? 5),
          serviceChargeRate: Number(activeUser.serviceChargeRate ?? 3),
          discountRate: Number(activeUser.discountRate ?? 0),
          role: activeUser.role,
          tenantId: activeUser.tenantId,
        },
      };
    } catch (error) {
      console.error('LOGIN ERROR:', error);
      throw error;
    }
  }

  async refreshTokens(token: string) {
    const stored = await this.prisma.refreshToken.findUnique({ where: { token } });

    if (!stored || stored.isRevoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      select: {
        ...this.profileSelect,
        isActive: true,
      },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('User inactive');

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    const tokens = await this.generateTokens(user.id, user.businessEmail, user.role, user.tenantId);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.toProfileResponse(user),
    };
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: this.profileSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const currentUser = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, tenantId: true, passwordHash: true },
        });

        if (!currentUser) {
          throw new NotFoundException('User not found');
        }

        const hotelName = this.optionalTrim(dto.hotelName ?? dto.hotel_name);
        const businessType = this.optionalTrim(dto.businessType ?? dto.business_type);
        const businessLocation = this.optionalTrim(
          dto.businessLocation ?? dto.business_location,
        );
        const businessAddress = this.optionalTrim(dto.businessAddress ?? dto.business_address);
        const kitchenOpenTime = this.optionalTrim(dto.kitchenOpenTime ?? dto.kitchen_open_time);
        const kitchenCloseTime = this.normalizeKitchenCloseTime(
          dto.kitchenCloseTime ?? dto.kitchen_close_time,
        );
        const taxRate = this.optionalDecimal(dto.taxRate ?? dto.tax_rate);
        const serviceChargeRate = this.optionalDecimal(
          dto.serviceChargeRate ?? dto.service_charge_rate,
        );
        const discountRate = this.optionalDecimal(dto.discountRate ?? dto.discount_rate);
        const oldPassword = this.optionalTrim(dto.oldPassword);
        const newPassword = this.optionalTrim(dto.newPassword);
        const confirmPassword = this.optionalTrim(dto.confirmPassword);
        const passwordChangeRequested = Boolean(newPassword);

        if (passwordChangeRequested) {
          if (!oldPassword) {
            throw new BadRequestException('Old password and new password are required to change password.');
          }

          if (confirmPassword && confirmPassword !== newPassword) {
            throw new BadRequestException('Confirm password does not match new password.');
          }

          const isValid = await bcrypt.compare(oldPassword, currentUser.passwordHash);
          if (!isValid) {
            throw new BadRequestException('Old password is incorrect');
          }
        }

        const updated = await tx.user.update({
          where: { id: userId },
          data: {
            ...(hotelName && { hotelName }),
            ...(businessType && { businessType }),
            ...(businessLocation && { businessLocation }),
            ...(businessAddress && { businessAddress }),
            ...(kitchenOpenTime && { kitchenOpenTime }),
            ...(kitchenCloseTime && { kitchenCloseTime }),
            ...((dto.businessEmail ?? dto.business_email) && {
              businessEmail: (dto.businessEmail ?? dto.business_email)!.toLowerCase().trim(),
            }),
            ...((dto.contactPersonName ?? dto.contact_person_name) && {
              contactPersonName: (dto.contactPersonName ?? dto.contact_person_name)!.trim(),
            }),
            ...((dto.contactPersonMobileNumber ?? dto.contact_person_mobile_number) && {
              contactPersonMobileNumber: (
                dto.contactPersonMobileNumber ?? dto.contact_person_mobile_number
              )!.trim(),
            }),
            ...(taxRate !== undefined && { taxRate }),
            ...(serviceChargeRate !== undefined && { serviceChargeRate }),
            ...(discountRate !== undefined && { discountRate }),
            ...(newPassword && { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) }),
          },
          select: this.profileSelect,
        });

        if (hotelName && currentUser.tenantId) {
          await tx.tenant.update({
            where: { id: currentUser.tenantId },
            data: { name: hotelName },
          });
        }

        return updated;
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Business email already registered');
      }
      throw error;
    }
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    const isValid = user
      ? await bcrypt.compare(dto.oldPassword, user.passwordHash)
      : await bcrypt.compare(dto.oldPassword, '$2b$12$invalidhashfortimingattackprevention');

    if (!user || !isValid) {
      throw new BadRequestException('Old password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Password updated successfully' };
  }

  private async ensureUserHasTenant(user: any) {
    if (user.tenantId && user.role !== Role.STAFF) {
      return user;
    }

    if (user.tenantId && user.role === Role.STAFF) {
      return this.prisma.user.update({
        where: { id: user.id },
        data: { role: Role.MANAGER },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const tenant = await this.createTenantForHotelName(tx, user.hotelName);
      const nextRole = user.role === Role.STAFF ? Role.MANAGER : user.role;

      return tx.user.update({
        where: { id: user.id },
        data: {
          tenantId: tenant.id,
          role: nextRole,
        },
      });
    });
  }

  private async createTenantForHotelName(tx: any, hotelName: string) {
    const tenantName = hotelName.trim();
    const baseSlug = this.slugify(tenantName) || `tenant-${nanoid(6).toLowerCase()}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${nanoid(6).toLowerCase()}`;
      const existing = await tx.tenant.findUnique({ where: { slug }, select: { id: true } });
      if (existing) {
        continue;
      }

      try {
        return await tx.tenant.create({
          data: {
            name: tenantName,
            slug,
            isActive: true,
          },
          select: { id: true, name: true, slug: true },
        });
      } catch (error: any) {
        if (error.code === 'P2002') {
          continue;
        }
        throw error;
      }
    }

    return tx.tenant.create({
      data: {
        name: tenantName,
        slug: `${baseSlug}-${nanoid(10).toLowerCase()}`,
        isActive: true,
      },
      select: { id: true, name: true, slug: true },
    });
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
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

  private toProfileResponse(user: any) {
    return {
      id: user.id,
      businessEmail: user.businessEmail,
      hotelName: user.hotelName,
      businessType: user.businessType,
      businessLocation: user.businessLocation,
      businessAddress: user.businessAddress,
      kitchenOpenTime: user.kitchenOpenTime,
      kitchenCloseTime: user.kitchenCloseTime,
      contactPersonName: user.contactPersonName,
      contactPersonMobileNumber: user.contactPersonMobileNumber,
      taxRate: Number(user.taxRate ?? 5),
      serviceChargeRate: Number(user.serviceChargeRate ?? 3),
      discountRate: Number(user.discountRate ?? 0),
      role: user.role,
      tenantId: user.tenantId,
    };
  }

  private async generateTokens(
    userId: string,
    businessEmail: string,
    role: string,
    tenantId?: string | null,
  ) {
    const payload = {
      sub: userId,
      userId,
      businessEmail,
      email: businessEmail,
      role,
      tenantId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get('jwt.secret'),
        expiresIn: '30m',
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get('jwt.refreshSecret'),
        expiresIn: this.config.get('jwt.refreshExpiresIn') ?? '7d',
      }),
    ]);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: { token: refreshToken, userId, expiresAt },
    });

    return { accessToken, refreshToken };
  }
}
