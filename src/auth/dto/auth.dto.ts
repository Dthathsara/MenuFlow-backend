import {
  IsEmail, IsOptional, IsString, MinLength, MaxLength, Matches,
} from 'class-validator';

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
  @IsString()
  @MinLength(2)
  hotelName?: string;

  @IsOptional()
  @IsEmail()
  businessEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  contactPersonName?: string;

  @IsOptional()
  @IsString()
  @MinLength(7)
  contactPersonMobileNumber?: string;
}

export class ChangePasswordDto {
  @IsString()
  oldPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
    message: 'Password must include upper, lower, number, and special character',
  })
  newPassword!: string;
}
