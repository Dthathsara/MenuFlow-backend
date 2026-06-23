import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateOrderItemDto {
  @IsOptional()
  @IsString()
  menu_item_id?: string | null;

  @IsString()
  @IsNotEmpty()
  food_name!: string;

  @IsOptional()
  @IsString()
  category_name?: string | null;

  @IsOptional()
  @IsString()
  sub_category_name?: string | null;

  @IsOptional()
  @IsString()
  serving_size?: string | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unit_price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  prep_time_min?: number | null;

  @IsOptional()
  @IsString()
  image_url?: string | null;

  @IsOptional()
  @IsString()
  item_note?: string | null;
}

export class DemoPaymentDto {
  @IsOptional()
  @IsIn(['unpaid', 'paid', 'failed', 'refunded'])
  status?: string;

  @IsOptional()
  @IsString()
  card_last4?: string;
}

export class CreateOrderDto {
  @IsOptional()
  @IsString()
  tenant_id?: string;

  @IsString()
  @IsNotEmpty()
  customer_session_id!: string;

  @IsOptional()
  @IsString()
  table_id?: string | null;

  @IsOptional()
  @IsString()
  qr_code_id?: string | null;

  @IsOptional()
  @IsString()
  qr_token?: string | null;

  @IsOptional()
  @IsString()
  table_number?: string | null;

  @IsOptional()
  @IsString()
  section?: string | null;

  @IsString()
  @IsNotEmpty()
  customer_name!: string;

  @IsString()
  @IsNotEmpty()
  customer_phone!: string;

  @IsIn(['dine_in', 'takeaway', 'delivery'])
  order_type!: string;

  @IsOptional()
  @IsString()
  item_note?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => DemoPaymentDto)
  payment?: DemoPaymentDto;
}
