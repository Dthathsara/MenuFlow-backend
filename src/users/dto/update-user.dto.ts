import { IsEmail, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { Role } from '../../auth/enums/role.enum';

const emptyStringToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalNumber = ({
  key,
  obj,
  value,
}: {
  key: string;
  obj: Record<string, unknown>;
  value: unknown;
}) => {
  const rawValue = obj?.[key] ?? value;

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    return trimmed === '' ? undefined : Number(trimmed);
  }

  return rawValue;
};

export class UpdateUserDto {
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MinLength(2)
  contactPersonName?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MinLength(7)
  contactPersonMobileNumber?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  oldPassword?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  newPassword?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  confirmNewPassword?: string;

}

export class UpdateUserRoleDto {
  @IsEnum(Role)
  role!: Role;
}

export class UpdateRestaurantProfileDto {
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MinLength(2)
  hotelName?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEmail()
  businessEmail?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  businessType?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  businessLocation?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  businessAddress?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  kitchenOpenTime?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  kitchenCloseTime?: string;

  @IsOptional()
  @Transform(optionalNumber)
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @Transform(optionalNumber)
  @IsNumber()
  @Min(0)
  serviceChargeRate?: number;

  @IsOptional()
  @Transform(optionalNumber)
  @IsNumber()
  @Min(0)
  discountRate?: number;
}
