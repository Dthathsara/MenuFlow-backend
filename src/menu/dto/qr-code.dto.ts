import {
  IsString,
  IsOptional,
  IsUUID,
  IsBoolean,
  MinLength,
} from 'class-validator';

export class CreateQrCodeDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsUUID()
  menuId?: string;

  @IsString()
  @MinLength(1)
  label!: string;
}

export class UpdateQrCodeDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsUUID()
  menuId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
