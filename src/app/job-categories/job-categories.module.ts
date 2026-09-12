import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobCategoriesService } from './job-categories.service';
import { JobCategoriesController } from './job-categories.controller';
import { JobCategory, JobCategorySchema } from './schemas/job-category.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: JobCategory.name, schema: JobCategorySchema }]),
  ],
  controllers: [JobCategoriesController],
  providers: [JobCategoriesService],
  exports: [JobCategoriesService, MongooseModule]
})
export class JobCategoriesModule {}
