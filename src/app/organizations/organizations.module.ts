import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { Organization, OrganizationSchema } from './schemas/organization.schema';
import { Job, JobSchema } from '../jobs/schemas/job.schema';

@Module({
  imports: [MongooseModule.forFeature([
    { name: Organization.name, schema: OrganizationSchema },
    { name: Job.name, schema: JobSchema },
  ])],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService]
})
export class OrganizationsModule {}
