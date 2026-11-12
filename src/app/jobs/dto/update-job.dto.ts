import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateJobDto } from './create-job.dto';

export class UpdateJobDto extends PartialType(CreateJobDto) {
  /** Stored on the revision snapshot, e.g. "corrected last date". */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  revisionNote?: string;
}
