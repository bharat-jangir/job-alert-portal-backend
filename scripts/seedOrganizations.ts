import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app/app.module';
import { OrganizationsService } from '../src/app/organizations/organizations.service';
import { getModelToken } from '@nestjs/mongoose';
import { Job } from '../src/app/jobs/schemas/job.schema';
import { Model } from 'mongoose';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  
  const organizationsService = app.get(OrganizationsService);
  const jobModel = app.get<Model<any>>(getModelToken(Job.name));

  console.log(`\n🌱 Starting Organization Seeding & Migration...\n`);

  // 1. Fetch distinct organization strings from Jobs
  const distinctOrgs = await jobModel.distinct('organization').exec();
  console.log(`Found ${distinctOrgs.length} distinct organization names in Jobs.`);

  // 2. Add some highly common organizations even if no jobs exist yet
  const commonOrgs = [
    'Staff Selection Commission (SSC)',
    'Union Public Service Commission (UPSC)',
    'Railway Recruitment Board (RRB)',
    'Institute of Banking Personnel Selection (IBPS)',
    'National Testing Agency (NTA)'
  ];

  const allOrgsToSeed = Array.from(new Set([...distinctOrgs, ...commonOrgs])).filter(Boolean);
  
  const orgMap = new Map<string, string>(); // name -> _id

  // 3. Insert or Get Organizations
  for (const orgName of allOrgsToSeed) {
    let orgSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    let existing;
    try {
      // Direct DB check to avoid exceptions for missing items if not finding by slug
      const orgs = await organizationsService.findAll();
      existing = orgs.find(o => o.name === orgName || o.slug === orgSlug);
      
      if (!existing) {
        existing = await organizationsService.create({
          name: orgName,
          slug: orgSlug,
          isActive: true
        });
        console.log(`  ✅ Created Organization: ${orgName}`);
      } else {
        console.log(`  ℹ️ Organization already exists: ${orgName}`);
      }
      
      orgMap.set(orgName, existing._id.toString());
    } catch (err: any) {
      console.error(`  ❌ Failed to process organization ${orgName}:`, err.message);
    }
  }

  console.log(`\n🔄 Migrating Jobs to use organizationId...\n`);

  // 4. Update existing jobs
  const jobsToUpdate = await jobModel.find({ organizationId: { $exists: false } }).exec();
  console.log(`Found ${jobsToUpdate.length} jobs needing organizationId migration.`);

  let updatedCount = 0;
  for (const job of jobsToUpdate) {
    if (job.organization && orgMap.has(job.organization)) {
      job.organizationId = orgMap.get(job.organization);
      await job.save();
      updatedCount++;
    }
  }

  console.log(`  ✅ Successfully updated ${updatedCount} jobs.`);
  console.log('\n✅ Seeding and Migration complete!\n');

  await app.close();
  process.exit(0);
}

bootstrap();
