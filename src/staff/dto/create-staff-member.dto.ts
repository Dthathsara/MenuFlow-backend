import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export const STAFF_MEMBER_ROLES = ['Waiter', 'Counter', 'Chef'] as const;
export const STAFF_MEMBER_STATUSES = [
  'Active',
  'Inactive',
  'On Leave',
] as const;

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export type StaffMemberRole = string;
export type StaffMemberStatus = (typeof STAFF_MEMBER_STATUSES)[number];

export class CreateStaffMemberDto {
  @IsString()
  @Transform(trimString)
  @MinLength(1)
  fullName!: string;

  @IsString()
  @Transform(trimString)
  role!: StaffMemberRole;

  @IsEmail()
  @Transform(normalizeEmail)
  email!: string;

  @IsString()
  @Transform(trimString)
  @MinLength(1)
  phone!: string;

  @IsString()
  @Transform(trimString)
  @MinLength(1)
  nicNumber!: string;

  @IsString()
  @Transform(trimString)
  @MinLength(1)
  address!: string;

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
