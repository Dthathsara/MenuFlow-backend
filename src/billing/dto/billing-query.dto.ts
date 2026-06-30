import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class BillingQueryDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  search?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  status?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  method?: string;
}
