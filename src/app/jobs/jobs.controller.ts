import {
  Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JobsService, Actor } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { QueryJobDto } from './dto/query-job.dto';
import { Job } from './schemas/job.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../auth/guards/policies.guard';
import { CheckPolicies } from '../auth/decorators/policies.decorator';
import { Action, AdminRole, Resource, hasPermission } from '../auth/enums/role.enum';

/** Builds the acting user for the service; PUBLISH comes straight from the role policies. */
function actorFrom(req: any): Actor {
  const role = req.user?.role as AdminRole;
  return {
    id: req.user?.id,
    email: req.user?.email,
    role,
    canPublish: !!role && hasPermission(role, Action.PUBLISH, Resource.JOB),
  };
}

/**
 * Route order matters: static paths first, `:slug` last.
 * Mutations and anything that can expose non-public content require JWT + policy.
 */
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobService: JobsService) {}

  // === PROTECTED (JWT + policies) ===

  @Post()
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.CREATE, resource: Resource.JOB })
  create(@Body() dto: CreateJobDto, @Req() req: any): Promise<Job> {
    return this.jobService.create(dto, actorFrom(req));
  }

  /** All statuses (drafts included) for the admin list. */
  @Get('admin/list')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.READ, resource: Resource.JOB })
  adminList(@Query() query: QueryJobDto) {
    return this.jobService.adminList(query);
  }

  /** Dashboard numbers. */
  @Get('stats')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.READ, resource: Resource.JOB })
  stats() {
    return this.jobService.stats();
  }

  /** Single post by ID in any status (admin edit screen). */
  @Get('id/:id')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.READ, resource: Resource.JOB })
  findOne(@Param('id') id: string): Promise<Job> {
    return this.jobService.findOne(id);
  }

  @Patch('id/:id')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.UPDATE, resource: Resource.JOB })
  update(@Param('id') id: string, @Body() dto: UpdateJobDto, @Req() req: any): Promise<Job> {
    return this.jobService.update(id, dto, actorFrom(req));
  }

  @Post('id/:id/duplicate')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.CREATE, resource: Resource.JOB })
  duplicate(@Param('id') id: string, @Req() req: any): Promise<Job> {
    return this.jobService.duplicate(id, actorFrom(req));
  }

  /**
   * AI-translates the post's text (Hindi) and stores it as a `machine` translation for a person to check.
   * Never changes dates, links, numbers or the slug. Replacing a `reviewed` translation needs `force`.
   */
  @Post('id/:id/translate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.UPDATE, resource: Resource.JOB })
  translate(@Param('id') id: string, @Body() body: { force?: boolean }, @Req() req: any) {
    return this.jobService.translate(id, { lang: 'hi', force: !!body?.force }, actorFrom(req));
  }

  @Delete('id/:id')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.DELETE, resource: Resource.JOB })
  remove(@Param('id') id: string): Promise<void> {
    return this.jobService.remove(id);
  }

  @Get('id/:id/revisions')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.READ, resource: Resource.JOB })
  revisions(@Param('id') id: string) {
    return this.jobService.listRevisions(id);
  }

  @Post('id/:id/revisions/:revisionId/restore')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.UPDATE, resource: Resource.JOB })
  restore(@Param('id') id: string, @Param('revisionId') revisionId: string, @Req() req: any) {
    return this.jobService.restoreRevision(id, revisionId, actorFrom(req));
  }

  @Patch('bulletins/:id/toggle')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.UPDATE, resource: Resource.JOB })
  toggleBulletin(@Param('id') id: string): Promise<Job> {
    return this.jobService.toggleBulletin(id);
  }

  // === PUBLIC READS (published posts only) ===

  @Get('organizations')
  getOrganizations() {
    return this.jobService.getDistinctOrganizations();
  }

  @Get()
  findAll(@Query() query: QueryJobDto) {
    return this.jobService.findAll(query);
  }

  /** Homepage aggregate: bulletins, popular and one list per category. Cached 30s. */
  @Get('home')
  home(@Query('lang') lang?: string) {
    return this.jobService.home(lang);
  }

  @Get('facets')
  facets() {
    return this.jobService.facets();
  }

  @Get('sitemap')
  sitemap() {
    return this.jobService.sitemap();
  }

  // Batched in memory and rate-limited.
  @Post('id/:id/view')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  incrementViews(@Param('id') id: string) {
    this.jobService.trackView(id);
    return { ok: true };
  }

  @Post('id/:id/apply')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  incrementApplications(@Param('id') id: string) {
    this.jobService.trackApply(id);
    return { ok: true };
  }

  @Get('upcoming')
  findUpcomingDeadlines(@Query('lang') lang?: string) {
    return this.jobService.findUpcomingDeadlines(lang);
  }

  @Get('popular')
  findPopularJobs(@Query('lang') lang?: string) {
    return this.jobService.findPopularJobs(lang);
  }

  @Get('organization/:organization')
  findJobsByOrganization(@Param('organization') organization: string, @Query('lang') lang?: string) {
    return this.jobService.findJobsByOrganization(organization, lang);
  }

  @Get('search')
  searchJobs(@Query('q') query: string, @Query('lang') lang?: string) {
    return this.jobService.searchJobs(query, lang);
  }

  @Get('latest')
  findLatestJobs(@Query('limit') limit?: string, @Query('lang') lang?: string) {
    return this.jobService.findLatestJobs(limit ? parseInt(limit, 10) : 15, lang);
  }

  @Get('by-type/:type')
  findByType(@Param('type') type: string, @Query('lang') lang?: string) {
    return this.jobService.findByType(type, lang);
  }

  @Get('bulletins')
  findBulletins(@Query('lang') lang?: string) {
    return this.jobService.findBulletins(lang);
  }

  @Get(':slug/related')
  findRelated(@Param('slug') slug: string, @Query('lang') lang?: string) {
    return this.jobService.findRelated(slug, lang);
  }

  // Must stay last.
  @Get(':slug')
  findBySlug(@Param('slug') slug: string, @Query('lang') lang?: string) {
    return this.jobService.findBySlug(slug, lang);
  }
}
