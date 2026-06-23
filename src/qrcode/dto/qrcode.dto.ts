import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsArray,
  MinLength,
} from 'class-validator';

export class CreateQrCodeDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  menuId!: string;

  @IsUUID()
  tableId!: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  staffIds?: string[];
}

export class UpdateQrCodeDto {
  @IsOptional()
  @IsUUID()
  menuId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignStaffDto {
  @IsArray()
  @IsUUID('4', { each: true })
  staffIds!: string[];
}
