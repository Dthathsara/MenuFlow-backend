import { IsIn } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsIn(['accepted', 'preparing', 'ready', 'delivered', 'cancelled'])
  order_status!: string;
}
