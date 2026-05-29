import {
  IsEmail, IsOptional, IsString, MinLength, MaxLength, Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

const emptyStringToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class LoginDto {
  @IsEmail()
  businessEmail!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class RegisterDto {
  @IsEmail()
  businessEmail!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
    message: 'Password must include upper, lower, number, and special character',
  })
  password!: string;

  @IsString()
  @MinLength(2)
  hotelName!: string;

  @IsString()
  @MinLength(2)
  contactPersonName!: string;

  @IsString()
  @MinLength(7)
  contactPersonMobileNumber!: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MinLength(2)
  hotelName?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MinLength(2)
  hotel_name?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  businessType?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  business_type?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  businessLocation?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  business_location?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  kitchenCloseTime?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  kitchen_close_time?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEmail()
  businessEmail?: string;

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
  @MinLength(8)
  newPassword?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  confirmPassword?: string;
}

export class ChangePasswordDto {
  @Transform(trimString)
  @IsString()
  oldPassword!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
    message: 'Password must include upper, lower, number, and special character',
  })
  newPassword!: string;
}
