import { IsString, IsEnum, IsDate, IsUrl, IsArray, ValidateNested, IsOptional, Matches, Validate, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ExperienceLevel, QualificationLevel, JobType } from '../schemas/job.schema';

// Custom validator for future dates
const IsFutureDate = () => {
  return function (object: Object, propertyName: string) {
    return {
      validator: (value: Date) => {
        return value > new Date();
      },
      message: `${propertyName} must be a future date`
    };
  };
};

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
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  htmlContent?: string;

  @IsString()
  @IsOptional()
  organization?: string;

  @IsString()
  @IsOptional()
  organizationId?: string;

  @IsBoolean()
  @IsOptional()
  isBulletin?: boolean;

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

  @IsEnum(JobType)
  @IsOptional()
  type?: JobType;
} 