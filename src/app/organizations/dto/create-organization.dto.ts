import { IsString, IsOptional, IsBoolean, IsNotEmpty, IsUrl, Matches, MaxLength } from 'class-validator';
import { EmptyToUndefined } from '../../../common/decorators/empty-to-undefined';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(200)
  name: string;

  @IsOptional()
  @EmptyToUndefined()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lowercase letters, numbers and hyphens' })
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'logo must be an http(s) URL' })
  logo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
