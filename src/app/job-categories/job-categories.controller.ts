import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { JobCategoriesService } from './job-categories.service';
import { CreateJobCategoryDto, UpdateJobCategoryDto } from './dto/job-category.dto';

@Controller('job-categories')
export class JobCategoriesController {
  constructor(private readonly jobCategoriesService: JobCategoriesService) {}

  @Post()
  create(@Body() createJobCategoryDto: CreateJobCategoryDto) {
    return this.jobCategoriesService.create(createJobCategoryDto);
  }

  @Get('active')
  findAllActive() {
    return this.jobCategoriesService.findAllActive();
  }

  @Get()
  findAll() {
    return this.jobCategoriesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jobCategoriesService.findOne(id);
  }

  @Patch(':id/reorder')
  reorder(@Param('id') id: string, @Body('newSequence') newSequence: number) {
    return this.jobCategoriesService.reorder(id, newSequence);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateJobCategoryDto: UpdateJobCategoryDto) {
    return this.jobCategoriesService.update(id, updateJobCategoryDto);
  }

  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.jobCategoriesService.softDelete(id);
  }
}
