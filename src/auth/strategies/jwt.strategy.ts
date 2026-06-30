import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '../enums/role.enum';

export interface JwtPayload {
  sub: string;
  userId?: string;
  email: string;
  role: string;
  tenantId?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    const secret = config.get<string>('jwt.secret');
    if (!secret) throw new Error('JWT_SECRET is not defined');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        tenantId: true,
        hotelName: true,
        businessType: true,
        businessLocation: true,
        kitchenCloseTime: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const activeUser =
      user.tenantId && user.role !== Role.STAFF
        ? user
        : await this.repairManageMenuUser(user);

    return activeUser;
  }

  private async repairManageMenuUser(user: any) {
    if (user.tenantId) {
      return this.prisma.user.update({
        where: { id: user.id },
        data: { role: Role.MANAGER },
        select: {
          id: true,
          email: true,
          role: true,
          tenantId: true,
          hotelName: true,
          businessType: true,
          businessLocation: true,
          kitchenCloseTime: true,
          isActive: true,
        },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const tenant = await this.createTenantForHotelName(tx, user.hotelName);
      return tx.user.update({
        where: { id: user.id },
        data: {
          tenantId: tenant.id,
          role: user.role === Role.STAFF ? Role.MANAGER : user.role,
        },
        select: {
          id: true,
          email: true,
          role: true,
          tenantId: true,
          hotelName: true,
          businessType: true,
          businessLocation: true,
          kitchenCloseTime: true,
          isActive: true,
        },
      });
    });
  }

  private async createTenantForHotelName(tx: any, hotelName: string) {
    const tenantName = hotelName?.trim() || 'Restaurant';
    const baseSlug =
      this.slugify(tenantName) || `tenant-${nanoid(6).toLowerCase()}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug =
        attempt === 0 ? baseSlug : `${baseSlug}-${nanoid(6).toLowerCase()}`;
      const existing = await tx.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (existing) continue;

      try {
        return await tx.tenant.create({
          data: { name: tenantName, slug, isActive: true },
          select: { id: true, name: true, slug: true },
        });
      } catch (error: any) {
        if (error.code === 'P2002') continue;
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
}
