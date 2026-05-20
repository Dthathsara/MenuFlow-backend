import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '../../auth/enums/role.enum';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  contactPersonName?: string;

  @IsOptional()
  @IsString()
  @MinLength(7)
  contactPersonMobileNumber?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  isActive?: boolean;
}
