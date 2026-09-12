import { IsString, IsNumber, IsBoolean, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateJobCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsNumber()
  @IsOptional()
  sequenceNo?: number;

  @IsBoolean()
  @IsOptional()
  showOnHome?: boolean;

  @IsBoolean()
  @IsOptional()
  isDeleted?: boolean;
}

export class UpdateJobCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsNumber()
  @IsOptional()
  sequenceNo?: number;

  @IsBoolean()
  @IsOptional()
  showOnHome?: boolean;

  @IsBoolean()
  @IsOptional()
  isDeleted?: boolean;
}
