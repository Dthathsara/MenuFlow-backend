import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateStaffMemberDto } from './dto/create-staff-member.dto';
import { StaffMemberQueryDto } from './dto/staff-member-query.dto';
import { UpdateStaffMemberDto } from './dto/update-staff-member.dto';
import { CurrentStaffUser, StaffService } from './staff.service';

@Controller('staff-members')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffController {
  constructor(private staffService: StaffService) {}

  @Get()
  @Roles(Role.STAFF)
  findAll(
    @CurrentUser() currentUser: CurrentStaffUser,
    @Query() query: StaffMemberQueryDto,
  ) {
    return this.staffService.findAll(currentUser, query);
  }

  @Get('summary')
  @Roles(Role.STAFF)
  getSummary(@CurrentUser() currentUser: CurrentStaffUser) {
    return this.staffService.getSummary(currentUser);
  }

  @Get('roles')
  @Roles(Role.STAFF)
  getRoles(@CurrentUser() currentUser: CurrentStaffUser) {
    return this.staffService.getRoles(currentUser);
  }

  @Get('waiters')
  @Roles(Role.STAFF)
  getWaiters(@CurrentUser() currentUser: CurrentStaffUser) {
    return this.staffService.getWaiters(currentUser);
  }

  @Get(':id')
  @Roles(Role.STAFF)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: CurrentStaffUser,
  ) {
    return this.staffService.findOne(id, currentUser);
  }

  @Post()
  @Roles(Role.STAFF)
  create(
    @Body() dto: CreateStaffMemberDto,
    @CurrentUser() currentUser: CurrentStaffUser,
  ) {
    return this.staffService.create(dto, currentUser);
  }

  @Patch(':id')
  @Roles(Role.STAFF)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffMemberDto,
    @CurrentUser() currentUser: CurrentStaffUser,
  ) {
    return this.staffService.update(id, dto, currentUser);
  }

  @Delete(':id')
  @Roles(Role.STAFF)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: CurrentStaffUser,
  ) {
    return this.staffService.remove(id, currentUser);
  }
}
