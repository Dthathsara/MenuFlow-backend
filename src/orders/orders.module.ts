import { Module } from '@nestjs/common';
import {
  AdminOrdersController,
  CustomerOrdersController,
} from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [CustomerOrdersController, AdminOrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
