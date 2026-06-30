import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateBillDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  orderId?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  tableNumber?: string;

  @IsString()
  @Transform(trimString)
  waiterName!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  itemsCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  serviceChargeAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  method?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  status?: string;
}
