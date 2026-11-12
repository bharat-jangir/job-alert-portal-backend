import { IsString, IsNumber, IsBoolean, IsOptional, IsNotEmpty, Matches, MaxLength } from 'class-validator';

export class CreateJobCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lowercase letters, numbers and hyphens' })
  @MaxLength(120)
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
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lowercase letters, numbers and hyphens' })
  @MaxLength(120)
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
