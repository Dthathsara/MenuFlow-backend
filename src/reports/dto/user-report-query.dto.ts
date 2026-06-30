import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UserReportQueryDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  search?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  role?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  period?: string;
}
