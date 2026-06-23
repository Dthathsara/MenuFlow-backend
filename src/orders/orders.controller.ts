import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@Controller('customer-orders')
export class CustomerOrdersController {
  constructor(private ordersService: OrdersService) {}

  @Public()
  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.createCustomerOrder(dto);
  }

  @Public()
  @Get('session/:customerSessionId')
  findBySession(
    @Param('customerSessionId') customerSessionId: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.ordersService.findCustomerSessionOrders(
      customerSessionId,
      tenantId,
    );
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    return this.ordersService.findCustomerOrder(id, tenantId);
  }
}

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminOrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get()
  @Roles(Role.STAFF)
  findAll(
    @CurrentUser() currentUser: any,
    @Query('search') search?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('orderStatus') orderStatus?: string,
    @Query('qrCodeId') qrCodeId?: string,
    @Query('qrToken') qrToken?: string,
    @Query('tableNumber') tableNumber?: string,
    @Query('section') section?: string,
  ) {
    return this.ordersService.findManagerOrders(currentUser, {
      search,
      paymentStatus,
      orderStatus,
      qrCodeId,
      qrToken,
      tableNumber,
      section,
    });
  }

  @Get(':id')
  @Roles(Role.STAFF)
  findOne(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.ordersService.findManagerOrder(id, currentUser);
  }

  @Patch(':id/status')
  @Roles(Role.STAFF)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.ordersService.updateManagerOrderStatus(id, dto, currentUser);
  }
}
