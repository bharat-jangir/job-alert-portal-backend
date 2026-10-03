import { PartialType } from '@nestjs/mapped-types';
import { CreateRedirectLinkDto } from './create-redirect-link.dto';

export class UpdateRedirectLinkDto extends PartialType(CreateRedirectLinkDto) {}
