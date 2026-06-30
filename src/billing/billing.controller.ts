import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BillingService } from './billing.service';
import { BillingQueryDto } from './dto/billing-query.dto';
import { CollectPaymentDto } from './dto/collect-payment.dto';
import { CreateBillDto } from './dto/create-bill.dto';
import { RefundBillDto } from './dto/refund-bill.dto';

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Get()
  @Roles(Role.STAFF)
  findAll(@CurrentUser() currentUser: any, @Query() query: BillingQueryDto) {
    return this.billingService.findAll(currentUser, query);
  }

  @Post()
  @Roles(Role.STAFF)
  create(@Body() dto: CreateBillDto, @CurrentUser() currentUser: any) {
    return this.billingService.create(dto, currentUser);
  }

  @Patch(':id/pay')
  @Roles(Role.STAFF)
  collectPayment(
    @Param('id') id: string,
    @Body() dto: CollectPaymentDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.billingService.collectPayment(id, dto, currentUser);
  }

  @Patch(':id/refund')
  @Roles(Role.STAFF)
  refund(
    @Param('id') id: string,
    @Body() dto: RefundBillDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.billingService.refund(id, dto, currentUser);
  }

  @Get('export')
  @Roles(Role.STAFF)
  export(@CurrentUser() currentUser: any, @Query() query: BillingQueryDto) {
    return this.billingService.export(currentUser, query);
  }
}
