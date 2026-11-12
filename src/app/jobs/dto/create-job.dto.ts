import {
  IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsMongoId, IsNotEmpty, IsOptional, IsString, IsUrl,
  Matches, MaxLength, Validate, ValidateNested, ValidationArguments, ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EmptyToUndefined } from '../../../common/decorators/empty-to-undefined';
import { ExperienceLevel, POST_STATUSES, QualificationLevel } from '../schemas/job.schema';
import { SectionsSchema, firstIssue } from '../schemas/post-sections.schema';

@ValidatorConstraint({ name: 'sections', async: false })
class SectionsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return SectionsSchema.safeParse(value).success;
  }
  defaultMessage(args: ValidationArguments) {
    const r = SectionsSchema.safeParse(args.value);
    return r.success ? 'Invalid sections' : firstIssue(r.error);
  }
}

class ImportantDateDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsDateString()
  date?: string;
}

class AttachmentDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url: string;
}

const URL_OPTS = { protocols: ['http', 'https'], require_protocol: true };

export class CreateJobDto {
  @IsString()
  @IsNotEmpty({ message: 'title is required' })
  @MaxLength(300)
  title: string;

  /** Optional: generated from the title when omitted. */
  @IsOptional()
  @EmptyToUndefined()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lowercase letters, numbers and hyphens' })
  @MaxLength(120)
  slug?: string;

  /** Workflow state. Publishing/scheduling needs the PUBLISH permission (checked in the controller). */
  @IsOptional()
  @IsIn(POST_STATUSES as unknown as string[])
  status?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsDateString()
  scheduledAt?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300_000)
  htmlContent?: string;

  /** Typed content blocks (see post-sections.schema.ts). */
  @IsOptional()
  @IsArray()
  @Validate(SectionsConstraint)
  sections?: Record<string, any>[];

  @IsString()
  @IsOptional()
  @MaxLength(200)
  organization?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsMongoId()
  organizationId?: string;

  @IsBoolean()
  @IsOptional()
  isBulletin?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  states?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(200)
  salary?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsEnum(QualificationLevel)
  qualification?: QualificationLevel;

  @IsOptional()
  @EmptyToUndefined()
  @IsEnum(ExperienceLevel)
  experience?: ExperienceLevel;

  @IsOptional()
  @EmptyToUndefined()
  @IsDateString()
  lastDate?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsUrl(URL_OPTS)
  applyLink?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20_000)
  eligibility?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  totalVacancy?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  ageLimit?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportantDateDto)
  @IsOptional()
  importantDates?: ImportantDateDto[];

  @IsString()
  @IsOptional()
  @MaxLength(120)
  metaTitle?: string;

  @IsString()
  @IsOptional()
  @MaxLength(320)
  metaDescription?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsUrl(URL_OPTS)
  canonicalUrl?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsUrl(URL_OPTS)
  ogImage?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsOptional()
  @EmptyToUndefined()
  @IsUrl(URL_OPTS)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  updateNote?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];

  /** Category slug. Must match an existing, non-deleted job category. */
  @IsString()
  @IsOptional()
  @MaxLength(60)
  type?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsMongoId()
  categoryId?: string;
}
