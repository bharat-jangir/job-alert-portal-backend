import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { RedirectLinkService } from './redirect-link.service';
import { CreateRedirectLinkDto } from './dto/create-redirect-link.dto';
import { UpdateRedirectLinkDto } from './dto/update-redirect-link.dto';
import { RedirectLink } from '../redirect-links/schema/redirect-link.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../auth/guards/policies.guard';
import { CheckPolicies } from '../auth/decorators/policies.decorator';
import { Action, Resource } from '../auth/enums/role.enum';

@Controller('redirect-links')
export class RedirectLinkController {
  constructor(private readonly redirectLinkService: RedirectLinkService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.CREATE, resource: Resource.REDIRECT_LINK })
  create(@Body() createDto: CreateRedirectLinkDto): Promise<RedirectLink> {
    return this.redirectLinkService.create(createDto);
  }

  // Public read route
  @Get()
  findAll(@Query() query: any) {
    return this.redirectLinkService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<RedirectLink> {
    return this.redirectLinkService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.UPDATE, resource: Resource.REDIRECT_LINK })
  update(@Param('id') id: string, @Body() updateDto: UpdateRedirectLinkDto): Promise<RedirectLink> {
    return this.redirectLinkService.update(id, updateDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.DELETE, resource: Resource.REDIRECT_LINK })
  remove(@Param('id') id: string): Promise<void> {
    return this.redirectLinkService.remove(id);
  }
}