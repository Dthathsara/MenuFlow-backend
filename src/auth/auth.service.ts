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
import { ChangePasswordDto, LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto';
import { Role } from './enums/role.enum';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly profileSelect = {
    id: true,
    hotelName: true,
    businessEmail: true,
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
    return user;
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
          businessEmail: true,
          contactPersonName: true,
          contactPersonMobileNumber: true,
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
          businessEmail: activeUser.businessEmail,
          contactPersonName: activeUser.contactPersonName,
          contactPersonMobileNumber: activeUser.contactPersonMobileNumber,
          role: activeUser.role,
          tenantId: activeUser.tenantId,
        },
      };
    } catch (error) {
      console.error('LOGIN ERROR:', error);
      throw error;
    }
  }

  async refreshTokens(userId: string, token: string) {
    const stored = await this.prisma.refreshToken.findUnique({ where: { token } });

    if (!stored || stored.userId !== userId || stored.isRevoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        businessEmail: true,
        role: true,
        tenantId: true,
        isActive: true,
      },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('User inactive');

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    return this.generateTokens(user.id, user.businessEmail, user.role, user.tenantId);
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
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(dto.hotelName && { hotelName: dto.hotelName.trim() }),
          ...(dto.businessEmail && { businessEmail: dto.businessEmail.toLowerCase().trim() }),
          ...(dto.contactPersonName && { contactPersonName: dto.contactPersonName.trim() }),
          ...(dto.contactPersonMobileNumber && {
            contactPersonMobileNumber: dto.contactPersonMobileNumber.trim(),
          }),
        },
        select: this.profileSelect,
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
        expiresIn: this.config.get('jwt.expiresIn'),
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get('jwt.refreshSecret'),
        expiresIn: this.config.get('jwt.refreshExpiresIn'),
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
