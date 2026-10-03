import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsUrl,
  MaxLength,
} from 'class-validator';

/**
 * Canonical redirect link type enum — single source of truth.
 * Must match the schema enum in redirect-link.schema.ts.
 */
export enum RedirectLinkType {
  RESULT = 'RESULT',
  ANSWERKEY = 'ANSWERKEY',
  ADMISSION = 'ADMISSION',
  ADMITCARD = 'ADMITCARD',
  ONLINEFORM = 'ONLINEFORM',
  UPDATE = 'UPDATE',
  SYLLABUS = 'SYLLABUS',
  UPCOMING = 'UPCOMING',
  VERIFICATION = 'VERIFICATION',
  SARKARIYOJANA = 'SARKARIYOJANA',
  JOB = 'JOB',
}

export enum RedirectType {
  INTERNAL = 'internal',
  EXTERNAL = 'external',
}

export class CreateRedirectLinkDto {
  @IsEnum(RedirectLinkType)
  @IsNotEmpty()
  type: RedirectLinkType;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  targetId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  slug?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  title?: string;

  @IsString()
  @IsOptional()
  @IsUrl({}, { message: 'externalUrl must be a valid URL' })
  externalUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  tag?: string;

  @IsEnum(RedirectType)
  @IsNotEmpty()
  redirectType: RedirectType;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
