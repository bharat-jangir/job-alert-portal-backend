import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { Job, JobSchema } from './schemas/job.schema';
import { JobRevision, JobRevisionSchema } from './schemas/job-revision.schema';
import { JobCategory, JobCategorySchema } from '../job-categories/schemas/job-category.schema';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Job.name, schema: JobSchema },
      { name: JobRevision.name, schema: JobRevisionSchema },
      { name: JobCategory.name, schema: JobCategorySchema },
      { name: Organization.name, schema: OrganizationSchema },
    ]),
  ],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
