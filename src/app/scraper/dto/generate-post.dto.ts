import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class ScrapeJobDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'Must be a valid http or https URL' })
  @IsNotEmpty({ message: 'Source URL is required' })
  url: string;

  @IsOptional()
  @IsString()
  postType?: string;
}

