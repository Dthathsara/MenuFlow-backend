import { IsIn, IsOptional } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsOptional()
  @IsIn(['accepted', 'preparing', 'ready', 'delivered', 'cancelled', 'canceled'])
  order_status?: string;

  @IsOptional()
  @IsIn(['accepted', 'preparing', 'ready', 'delivered', 'cancelled', 'canceled'])
  orderStatus?: string;
}
