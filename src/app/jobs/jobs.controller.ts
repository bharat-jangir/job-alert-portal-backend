import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { QueryJobDto } from './dto/query-job.dto';
import { Job } from './schemas/job.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../auth/guards/policies.guard';
import { CheckPolicies } from '../auth/decorators/policies.decorator';
import { Action, Resource } from '../auth/enums/role.enum';

// Controller for handling job-related API endpoints
@Controller('jobs')
export class JobsController {
  // Inject the JobsService to handle business logic
  constructor(private readonly jobService: JobsService) {}

  // === PROTECTED MUTATION ROUTES (require JWT + ABAC) ===

  // Create a new job post
  @Post()
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.CREATE, resource: Resource.JOB })
  async create(@Body() createJobDto: CreateJobDto): Promise<Job> {
    return this.jobService.create(createJobDto);
  }

  // Update a job by its ID
  @Patch('id/:id')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.UPDATE, resource: Resource.JOB })
  async update(
    @Param('id') id: string,
    @Body() updateJobDto: UpdateJobDto,
  ): Promise<Job> {
    return this.jobService.update(id, updateJobDto);
  }

  // Delete a job by its ID
  @Delete('id/:id')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.DELETE, resource: Resource.JOB })
  async remove(@Param('id') id: string): Promise<void> {
    return this.jobService.remove(id);
  }

  // Toggle bulletin status
  @Patch('bulletins/:id/toggle')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.UPDATE, resource: Resource.JOB })
  async toggleBulletin(@Param('id') id: string): Promise<Job> {
    return this.jobService.toggleBulletin(id);
  }

  // === PUBLIC READ ROUTES (no auth required) ===

  @Get('organizations')
  async getOrganizations() {
    return this.jobService.getDistinctOrganizations();
  }

  // Get all jobs with optional query filters (pagination, search, etc.)
  @Get()
  async findAll(@Query() query: QueryJobDto): Promise<{ jobs: Job[]; total: number }> {
    return this.jobService.findAll(query);
  }

  // Get a single job by its ID
  @Get('id/:id')
  async findOne(@Param('id') id: string): Promise<Job> {
    return this.jobService.findOne(id);
  }

  // Increment the view count for a job
  @Post('id/:id/view')
  async incrementViews(@Param('id') id: string): Promise<Job> {
    return this.jobService.incrementViews(id);
  }

  // Increment the applications count for a job
  @Post('id/:id/apply')
  async incrementApplications(@Param('id') id: string): Promise<Job> {
    return this.jobService.incrementApplications(id);
  }

  // Get jobs with upcoming deadlines
  @Get('upcoming')
  async findUpcomingDeadlines(): Promise<Job[]> {
    return this.jobService.findUpcomingDeadlines();
  }

  // Get popular jobs (by views and applications)
  @Get('popular')
  async findPopularJobs(): Promise<Job[]> {
    return this.jobService.findPopularJobs();
  }

  // Get jobs by organization
  @Get('organization/:organization')
  async findJobsByOrganization(@Param('organization') organization: string): Promise<Job[]> {
    return this.jobService.findJobsByOrganization(organization);
  }
  
  // Search jobs by a query string
  @Get('search')
  async searchJobs(@Query('q') query: string): Promise<Job[]> {
    return this.jobService.searchJobs(query);
  }

  // Get the latest jobs (limit can be specified)
  @Get('latest')
  async findLatestJobs(@Query('limit') limit?: string): Promise<Job[]> {
    const limitNumber = limit ? parseInt(limit, 10) : 15;
    return this.jobService.findLatestJobs(limitNumber);
  }

  // Get jobs by type, returning only title and slug
  @Get('by-type/:type')
  async findByType(@Param('type') type: string) {
    return this.jobService.findByType(type);
  }

  // Get jobs marked as bulletin
  @Get('bulletins')
  async findBulletins(): Promise<Job[]> {
    return this.jobService.findBulletins();
  }

  // Get a job by its slug
  @Get(':slug')
  async findBySlug(@Param('slug') slug: string): Promise<Job> {
    return this.jobService.findBySlug(slug);
  }
}