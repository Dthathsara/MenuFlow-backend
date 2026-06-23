import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import { UsersService } from './users.service';
import {
  UpdateRestaurantProfileDto,
  UpdateUserDto,
  UpdateUserRoleDto,
} from './dto/update-user.dto';
import {
  RESTAURANT_IMAGE_MAX_FILE_SIZE,
  restaurantImageMulterOptions,
} from './restaurant-image-upload.config';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  // Super Admin only — all users across all tenants
  @Get()
  @Roles(Role.SUPER_ADMIN)
  findAll() {
    return this.usersService.findAll();
  }

  // Client Admin and above — users within a tenant
  @Get('tenant/:tenantId')
  @Roles(Role.CLIENT_ADMIN)
  findByTenant(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @CurrentUser() currentUser: any,
  ) {
    const effectiveTenantId =
      currentUser.role === Role.SUPER_ADMIN ? tenantId : currentUser.tenantId;
    return this.usersService.findByTenant(effectiveTenantId);
  }

  // Any authenticated user — own profile
  @Get('me')
  getMe(@CurrentUser() currentUser: any) {
    return this.usersService.getAccountProfile(currentUser.id);
  }

  @Get('me/restaurant-profile')
  getRestaurantProfile(@CurrentUser() currentUser: any) {
    return this.usersService.getRestaurantProfile(currentUser.id);
  }

  // Manager and above — any user profile
  @Get(':id')
  @Roles(Role.MANAGER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  // Any authenticated user — update own profile
  @Patch('me')
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Patch('me/restaurant-profile')
  updateRestaurantProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateRestaurantProfileDto,
  ) {
    return this.usersService.updateRestaurantProfile(userId, dto);
  }

  @Patch('me/restaurant-image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image', restaurantImageMulterOptions))
  uploadRestaurantImage(
    @CurrentUser('id') userId: string,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: RESTAURANT_IMAGE_MAX_FILE_SIZE }),
          new FileTypeValidator({
            fileType: /^image\/(jpe?g|png|webp)$/i,
            fallbackToMimetype: true,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.usersService.updateRestaurantImage(userId, file);
  }

  // Client Admin and above — update another user's role
  @Patch(':id/role')
  @Roles(Role.CLIENT_ADMIN)
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.usersService.updateRole(id, dto.role, currentUser);
  }

  // Client Admin and above — deactivate a user
  @Patch(':id/deactivate')
  @Roles(Role.CLIENT_ADMIN)
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.usersService.deactivate(id, currentUser);
  }

  // Super Admin only — soft delete
  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.usersService.remove(id, currentUser);
  }
}
