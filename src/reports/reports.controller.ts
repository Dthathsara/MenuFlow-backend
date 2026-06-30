import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OrderReportQueryDto } from './dto/order-report-query.dto';
import { UserReportQueryDto } from './dto/user-report-query.dto';
import { ReportsService, ReportsCurrentUser } from './reports.service';

@Controller('reports/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get()
  @Roles(Role.STAFF)
  findUserReports(
    @CurrentUser() currentUser: ReportsCurrentUser,
    @Query() query: UserReportQueryDto,
  ) {
    return this.reportsService.findUserReports(currentUser, query);
  }

  @Get('filters')
  @Roles(Role.STAFF)
  getUserReportFilters(@CurrentUser() currentUser: ReportsCurrentUser) {
    return this.reportsService.getUserReportFilters(currentUser);
  }

  @Post('sync')
  @Roles(Role.STAFF)
  syncUserReports(@CurrentUser() currentUser: ReportsCurrentUser) {
    return this.reportsService.syncCurrentUserReports(currentUser);
  }

  @Get('export')
  @Roles(Role.STAFF)
  exportUserReports(
    @CurrentUser() currentUser: ReportsCurrentUser,
    @Query() query: UserReportQueryDto,
  ) {
    return this.reportsService.exportUserReports(currentUser, query);
  }
}

@Controller('reports/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get()
  @Roles(Role.STAFF)
  findOrderReport(
    @CurrentUser() currentUser: ReportsCurrentUser,
    @Query() query: OrderReportQueryDto,
  ) {
    return this.reportsService.findOrderReport(currentUser, query);
  }

  @Post('sync')
  @Roles(Role.STAFF)
  syncOrderReport(
    @CurrentUser() currentUser: ReportsCurrentUser,
    @Query() query: OrderReportQueryDto,
  ) {
    return this.reportsService.syncOrderReport(currentUser, query);
  }

  @Get('export')
  @Roles(Role.STAFF)
  exportOrderReport(
    @CurrentUser() currentUser: ReportsCurrentUser,
    @Query() query: OrderReportQueryDto,
  ) {
    return this.reportsService.exportOrderReport(currentUser, query);
  }

  @Get('filters')
  @Roles(Role.STAFF)
  getOrderReportFilters(@CurrentUser() currentUser: ReportsCurrentUser) {
    return this.reportsService.getOrderReportFilters(currentUser);
  }
}
