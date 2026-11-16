import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CrawlDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  adapter?: string;

  /** Candidates to look at per adapter. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  /** Max AI extractions this run (each one costs money). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxAiExtract?: number;
}
