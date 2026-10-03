import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { FaqsService } from './faqs.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../auth/guards/policies.guard';
import { CheckPolicies } from '../auth/decorators/policies.decorator';
import { Action, Resource } from '../auth/enums/role.enum';

@Controller('faqs')
export class FaqsController {
  constructor(private readonly faqsService: FaqsService) {}

  /** Public: get all active FAQs sorted by order */
  @Get('public')
  findPublic() {
    return this.faqsService.findPublic();
  }

  /** Admin: get all FAQs (including inactive) */
  @Get()
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.READ, resource: Resource.FAQ })
  findAll() {
    return this.faqsService.findAll();
  }

  /** Admin: create a new FAQ */
  @Post()
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.CREATE, resource: Resource.FAQ })
  create(@Body() dto: CreateFaqDto) {
    return this.faqsService.create(dto);
  }

  /** Admin: bulk reorder — body: [{ id, order }] */
  @Patch('reorder')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.UPDATE, resource: Resource.FAQ })
  reorder(@Body() items: { id: string; order: number }[]) {
    return this.faqsService.reorder(items);
  }

  /** Admin: move FAQ up one position */
  @Patch(':id/move-up')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.UPDATE, resource: Resource.FAQ })
  moveUp(@Param('id') id: string) {
    return this.faqsService.moveUp(id);
  }

  /** Admin: move FAQ down one position */
  @Patch(':id/move-down')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.UPDATE, resource: Resource.FAQ })
  moveDown(@Param('id') id: string) {
    return this.faqsService.moveDown(id);
  }

  /** Admin: get single FAQ */
  @Get(':id')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.READ, resource: Resource.FAQ })
  findOne(@Param('id') id: string) {
    return this.faqsService.findOne(id);
  }

  /** Admin: update FAQ */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.UPDATE, resource: Resource.FAQ })
  update(@Param('id') id: string, @Body() dto: UpdateFaqDto) {
    return this.faqsService.update(id, dto);
  }

  /** Admin: delete FAQ */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.DELETE, resource: Resource.FAQ })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.faqsService.remove(id);
  }
}
