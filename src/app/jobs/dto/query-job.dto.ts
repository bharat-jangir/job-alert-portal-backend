import { IsEnum, IsIn, IsMongoId, IsOptional, IsString, IsBoolean, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { EmptyToUndefined, ToBoolean } from '../../../common/decorators/empty-to-undefined';
import { ExperienceLevel, POST_STATUSES, QualificationLevel } from '../schemas/job.schema';

export class QueryJobDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(500)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(200)
  organization?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsMongoId()
  organizationId?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(60)
  type?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(100)
  tag?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsEnum(ExperienceLevel)
  experience?: ExperienceLevel;

  @IsOptional()
  @EmptyToUndefined()
  @IsEnum(QualificationLevel)
  qualification?: QualificationLevel;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;

  /** Admin list only; the public list always forces `published`. */
  @IsOptional()
  @EmptyToUndefined()
  @IsIn(POST_STATUSES as unknown as string[])
  status?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(200)
  search?: string;
}
