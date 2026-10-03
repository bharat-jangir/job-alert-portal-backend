import { IsString, IsEnum, IsArray, ValidateNested, IsOptional, IsBoolean, IsNotEmpty, IsMongoId } from 'class-validator';
import { Type } from 'class-transformer';
import { ExperienceLevel, QualificationLevel } from '../schemas/job.schema';

class ImportantDateDto {
  @IsString()
  @IsOptional()
  label?: string;

  @IsOptional()
  @IsString()
  date?: string;
}

export class CreateJobDto {
  @IsString()
  @IsNotEmpty({ message: 'title is required' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'slug is required' })
  slug: string;

  @IsString()
  @IsOptional()
  htmlContent?: string;

  @IsString()
  @IsOptional()
  organization?: string;

  @IsMongoId()
  @IsOptional()
  organizationId?: string;

  @IsBoolean()
  @IsOptional()
  isBulletin?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  salary?: string;

  @IsEnum(QualificationLevel)
  @IsOptional()
  qualification?: QualificationLevel;

  @IsEnum(ExperienceLevel)
  @IsOptional()
  experience?: ExperienceLevel;

  @IsOptional()
  @IsString()
  lastDate?: string;

  @IsOptional()
  @IsString()
  applyLink?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  eligibility?: string;

  @IsString()
  @IsOptional()
  totalVacancy?: string;

  @IsString()
  @IsOptional()
  ageLimit?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportantDateDto)
  @IsOptional()
  importantDates?: ImportantDateDto[];

  @IsString()
  @IsOptional()
  metaTitle?: string;

  @IsString()
  @IsOptional()
  metaDescription?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsString()
  @IsOptional()
  sourceUrl?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsMongoId()
  @IsOptional()
  categoryId?: string;
}