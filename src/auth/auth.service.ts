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
import { PrismaService } from '../prisma/prisma.service';
import {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  UpdateProfileDto,
} from './dto/auth.dto';
import { Role } from './enums/role.enum';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly profileSelect = {
    id: true,
    email: true,
    contactPersonName: true,
    contactPersonMobileNumber: true,
    role: true,
    tenantId: true,
  };

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.createUser({
      passwordHash,
      hotelName: dto.hotelName.trim(),
      email,
      contactPersonName: dto.contactPersonName.trim(),
      contactPersonMobileNumber: dto.contactPersonMobileNumber.trim(),
    });

    this.logger.log(`New user registered: ${user.id}`);
    return this.toProfileResponse(user);
  }

  private async createUser(data: {
    passwordHash: string;
    hotelName: string;
    email: string;
    contactPersonName: string;
    contactPersonMobileNumber: string;
  }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const tenant = await this.createTenantForHotelName(tx, data.hotelName);

        return tx.user.create({
          data: {
            ...data,
            businessEmail: data.email,
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
            email: true,
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
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    try {
      const user = await this.prisma.user.findFirst({
        where: {
          email: {
            equals: email,
            mode: 'insensitive',
          },
          deletedAt: null,
          isActive: true,
        },
      });

      const isValid = user
        ? await bcrypt.compare(dto.password, user.passwordHash)
        : await bcrypt.compare(
            dto.password,
            '$2b$12$invalidhashfortimingattackprevention',
          );

      if (!user || !isValid) {
        throw new UnauthorizedException('Invalid email or password');
      }
      const activeUser = await this.ensureUserHasTenant(user);

      let tokens: { accessToken: string; refreshToken: string };
      try {
        tokens = await this.generateTokens(
          activeUser.id,
          activeUser.email,
          activeUser.role,
          activeUser.tenantId,
        );
      } catch (error) {
        console.error('LOGIN TOKEN ERROR:', error);
        throw error;
      }
      this.logger.log(`User logged in: ${activeUser.id}`);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: activeUser.id,
          email: activeUser.email,
          hotelName: activeUser.hotelName,
          businessType: activeUser.businessType,
          businessLocation: activeUser.businessLocation,
          businessAddress: activeUser.businessAddress,
          kitchenOpenTime: activeUser.kitchenOpenTime,
          kitchenCloseTime: activeUser.kitchenCloseTime,
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
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token },
    });

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
    if (!user || !user.isActive)
      throw new UnauthorizedException('User inactive');

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.tenantId,
    );

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

    return this.toProfileResponse(user);
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

        const oldPassword = this.optionalTrim(dto.oldPassword);
        const newPassword = this.optionalTrim(dto.newPassword);
        const confirmNewPassword = this.optionalTrim(dto.confirmNewPassword);
        const passwordChangeRequested = Boolean(newPassword);

        if (passwordChangeRequested) {
          if (!oldPassword) {
            throw new BadRequestException(
              'Old password and new password are required to change password.',
            );
          }

          if (confirmNewPassword && confirmNewPassword !== newPassword) {
            throw new BadRequestException(
              'Confirm password does not match new password.',
            );
          }

          const isValid = await bcrypt.compare(
            oldPassword,
            currentUser.passwordHash,
          );
          if (!isValid) {
            throw new BadRequestException('Old password is incorrect');
          }
        }

        const updated = await tx.user.update({
          where: { id: userId },
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
            ...(newPassword && {
              passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
            }),
          },
          select: this.profileSelect,
        });

        return this.toProfileResponse(updated);
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Email already registered');
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
      : await bcrypt.compare(
          dto.oldPassword,
          '$2b$12$invalidhashfortimingattackprevention',
        );

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
    const baseSlug =
      this.slugify(tenantName) || `tenant-${nanoid(6).toLowerCase()}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug =
        attempt === 0 ? baseSlug : `${baseSlug}-${nanoid(6).toLowerCase()}`;
      const existing = await tx.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });
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

  private toProfileResponse(user: any) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      contactPersonName: user.contactPersonName,
      contactPersonMobileNumber: user.contactPersonMobileNumber,
    };
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    tenantId?: string | null,
  ) {
    const payload = {
      sub: userId,
      userId,
      email,
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
