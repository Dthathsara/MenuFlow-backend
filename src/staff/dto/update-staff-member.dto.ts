import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import {
  STAFF_MEMBER_STATUSES,
  StaffMemberRole,
  StaffMemberStatus,
} from './create-staff-member.dto';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class UpdateStaffMemberDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  role?: StaffMemberRole;

  @IsOptional()
  @IsEmail()
  @Transform(normalizeEmail)
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MinLength(1)
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MinLength(1)
  nicNumber?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MinLength(1)
  address?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  operationalAccess?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @IsIn(STAFF_MEMBER_STATUSES)
  status?: StaffMemberStatus;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MinLength(6)
  password?: string;
}
