import { IsIn, IsOptional } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsOptional()
  @IsIn(['accepted', 'preparing', 'ready', 'delivered', 'cancelled'])
  order_status?: string;

  @IsOptional()
  @IsIn(['accepted', 'preparing', 'ready', 'delivered', 'cancelled'])
  orderStatus?: string;
}
