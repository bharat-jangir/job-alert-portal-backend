import { Controller, Post, Body, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ScraperService } from './scraper.service';
import { ScrapeJobDto } from './dto/generate-post.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../auth/guards/policies.guard';
import { CheckPolicies } from '../auth/decorators/policies.decorator';
import { Action, AdminRole, Resource, hasPermission } from '../auth/enums/role.enum';
import { Actor } from '../jobs/jobs.service';

function actorFrom(req: any): Actor {
  const role = req.user?.role as AdminRole;
  return {
    id: req.user?.id,
    email: req.user?.email,
    role,
    canPublish: !!role && hasPermission(role, Action.PUBLISH, Resource.JOB),
  };
}

@Controller('scraper')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  /**
   * Scrapes URL and extracts structured fields & section blocks for the admin form.
   * Does NOT save to database yet; allows admin to review and edit first.
   */
  @Post('extract')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @CheckPolicies({ action: Action.CREATE, resource: Resource.JOB })
  async extractJob(@Body() dto: ScrapeJobDto) {
    const data = await this.scraperService.extractFromUrl(dto.url, dto.postType);
    return data;
  }

  /**
   * Scrapes URL, extracts data, AND creates a draft job post in database.
   */
  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @CheckPolicies({ action: Action.CREATE, resource: Resource.JOB })
  async generateDraftJob(@Body() dto: ScrapeJobDto, @Req() req: any) {
    const actor = actorFrom(req);
    const result = await this.scraperService.generateDraftJob(dto.url, dto.postType, actor);
    return {
      success: true,
      ...result,
    };
  }
}

