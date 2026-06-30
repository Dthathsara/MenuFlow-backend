import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class OrderReportQueryDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  period?: string;
}
