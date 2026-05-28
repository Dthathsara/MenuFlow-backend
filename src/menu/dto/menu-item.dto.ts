import {
  IsString, IsOptional, IsBoolean, IsInt, IsUUID,
  IsArray, IsNumber, MinLength, Min,
  ValidateNested, ArrayMinSize, IsPositive, IsIn,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const emptyStringToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const emptyStringToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trimString({ value });

const stringToBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return value;
};

export class CreateMenuItemOptionDto {
  @IsString()
  @MinLength(1)
  label!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price!: number;

  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateMenuItemOptionDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price?: number;

  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  priceChangeNote?: string;
}

export class CreateMenuItemDto {
  @IsUUID()
  menuId!: string;

  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MinLength(2)
  category_name?: string;

  @IsOptional()
  @IsUUID()
  subCategoryId?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsUUID()
  sub_category_id?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MinLength(2)
  sub_category_name?: string | null;

  @IsString()
  @Transform(trimString)
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  prepTimeMin?: number;

  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateMenuItemOptionDto)
  options!: CreateMenuItemOptionDto[];
}

export class UpdateMenuItemDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MinLength(2)
  category_name?: string;

  @IsOptional()
  @IsUUID()
  subCategoryId?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsUUID()
  sub_category_id?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MinLength(2)
  sub_category_name?: string | null;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  prepTimeMin?: number;

  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdatePriceDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ManagerMenuItemsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsString()
  categoryName?: string;

  @IsOptional()
  @IsString()
  category_name?: string;

  @IsOptional()
  @IsIn(['all', 'available', 'unavailable'])
  availability?: 'all' | 'available' | 'unavailable';
}

export class CreateManagerMenuItemDto {
  @IsString()
  @Transform(trimString)
  @MinLength(2)
  name!: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  category_id?: string;

  @Transform(emptyStringToNull)
  @IsString()
  @MinLength(1)
  category_name!: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsUUID()
  sub_category_id?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MinLength(2)
  sub_category_name?: string | null;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  image_url?: string | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  small_price!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  medium_price!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  large_price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  prep_time_min!: number;

  @Transform(stringToBoolean)
  @IsBoolean()
  is_available!: boolean;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  menu_id?: string;
}

export class CreateAddMenuItemDto {
  @IsString()
  @Transform(trimString)
  @MinLength(1)
  name!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  category_name!: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  sub_category_name?: string | null;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  small_price!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  medium_price!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  large_price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  prep_time_min!: number;

  @Transform(stringToBoolean)
  @IsBoolean()
  is_available!: boolean;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  image_url?: string | null;
}

export class UpdateManagerMenuItemDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MinLength(2)
  name?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MinLength(1)
  category_name?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsUUID()
  sub_category_id?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MinLength(2)
  sub_category_name?: string | null;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  image_url?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  small_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  medium_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  large_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  prep_time_min?: number;

  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  is_available?: boolean;
}

export class UpdateAddMenuItemDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MinLength(1)
  name?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MinLength(1)
  category_name?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  sub_category_name?: string | null;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  small_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  medium_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  large_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  prep_time_min?: number;

  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  is_available?: boolean;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  image_url?: string | null;
}

export class AddMenuItemsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  categoryName?: string;

  @IsOptional()
  @IsString()
  category_name?: string;

  @IsOptional()
  @IsIn(['all', 'available', 'unavailable'])
  availability?: 'all' | 'available' | 'unavailable';
}
