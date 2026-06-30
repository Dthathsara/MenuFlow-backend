import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';
import {
  STAFF_MEMBER_STATUSES,
  StaffMemberStatus,
} from './create-staff-member.dto';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class StaffMemberQueryDto {
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
  @IsIn([...STAFF_MEMBER_STATUSES, 'All Statuses'])
  status?: StaffMemberStatus | 'All Statuses';
}
