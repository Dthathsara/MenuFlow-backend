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
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto';

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
      return await this.prisma.user.create({
        data,
        select: {
          id: true,
          hotelName: true,
          businessEmail: true,
          contactPersonName: true,
          contactPersonMobileNumber: true,
          createdAt: true,
        },
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

      const tokens = await this.generateTokens(user.id, user.businessEmail, user.role);
      this.logger.log(`User logged in: ${user.id}`);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          hotelName: user.hotelName,
          businessEmail: user.businessEmail,
          contactPersonName: user.contactPersonName,
          contactPersonMobileNumber: user.contactPersonMobileNumber,
          role: user.role,
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
        isActive: true,
      },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('User inactive');

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    return this.generateTokens(user.id, user.businessEmail, user.role);
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

  private async generateTokens(
    userId: string,
    businessEmail: string,
    role: string,
  ) {
    const payload = {
      sub: userId,
      businessEmail,
      role,
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
