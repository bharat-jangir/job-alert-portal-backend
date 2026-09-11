import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { RedirectLinkService } from './redirect-link.service';
import { RedirectLink } from '../redirect-links/schema/redirect-link.schema';

@Controller('redirect-links')
export class RedirectLinkController {
  constructor(private readonly redirectLinkService: RedirectLinkService) {}

  @Post()
  create(@Body() createDto: any): Promise<RedirectLink> {
    return this.redirectLinkService.create(createDto);
  }

  @Get()
  findAll(@Query() query: any) {
    return this.redirectLinkService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<RedirectLink> {
    return this.redirectLinkService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: any): Promise<RedirectLink> {
    return this.redirectLinkService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.redirectLinkService.remove(id);
  }
} 