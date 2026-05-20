import {
  Injectable, NotFoundException, ForbiddenException, Logger,
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
    await this.findOne(id); // Ensure exists

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.contactPersonName && { contactPersonName: dto.contactPersonName.trim() }),
        ...(dto.contactPersonMobileNumber && {
          contactPersonMobileNumber: dto.contactPersonMobileNumber.trim(),
        }),
      },
      select: this.safeSelect,
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
}
