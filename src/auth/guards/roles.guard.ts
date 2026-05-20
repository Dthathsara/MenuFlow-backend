import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';

// Role hierarchy — higher index = more permissions
const ROLE_HIERARCHY: Role[] = [
  Role.STAFF,
  Role.MANAGER,
  Role.CLIENT_ADMIN,
  Role.SUPER_ADMIN,
];

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('No user in request');

    const userRoleIndex = ROLE_HIERARCHY.indexOf(user.role as Role);
    const hasRequiredRole = requiredRoles.some(
      (role) => userRoleIndex >= ROLE_HIERARCHY.indexOf(role),
    );

    if (!hasRequiredRole) {
      throw new ForbiddenException(
        `Requires one of: [${requiredRoles.join(', ')}]. User has: ${user.role}`,
      );
    }

    return true;
  }
}