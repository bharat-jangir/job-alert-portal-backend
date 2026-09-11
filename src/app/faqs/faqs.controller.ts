import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FaqsService } from './faqs.service';
import { CreateFaqDto } from './dto/create-faq.dto';

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
  findAll() {
    return this.faqsService.findAll();
  }

  /** Admin: create a new FAQ */
  @Post()
  create(@Body() dto: CreateFaqDto) {
    return this.faqsService.create(dto);
  }

  /** Admin: bulk reorder — body: [{ id, order }] */
  @Patch('reorder')
  reorder(@Body() items: { id: string; order: number }[]) {
    return this.faqsService.reorder(items);
  }

  /** Admin: move FAQ up one position */
  @Patch(':id/move-up')
  moveUp(@Param('id') id: string) {
    return this.faqsService.moveUp(id);
  }

  /** Admin: move FAQ down one position */
  @Patch(':id/move-down')
  moveDown(@Param('id') id: string) {
    return this.faqsService.moveDown(id);
  }

  /** Admin: get single FAQ */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.faqsService.findOne(id);
  }

  /** Admin: update FAQ */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateFaqDto>) {
    return this.faqsService.update(id, dto);
  }

  /** Admin: delete FAQ */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.faqsService.remove(id);
  }
}
