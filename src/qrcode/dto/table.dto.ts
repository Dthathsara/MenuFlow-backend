import {
  IsString, IsOptional, IsBoolean,
  IsUUID, MinLength,
} from 'class-validator';

export class CreateTableDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  number!: string;

  @IsOptional()
  @IsString()
  label?: string;
}

export class UpdateTableDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  number?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}