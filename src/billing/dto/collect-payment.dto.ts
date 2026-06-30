import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CollectPaymentDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  method?: string;
}
