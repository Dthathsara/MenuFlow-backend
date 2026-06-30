import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RefundBillDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  refundReason?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  reason?: string;
}
