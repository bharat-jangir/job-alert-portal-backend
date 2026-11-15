import { Controller, Post, Get, Body, UseGuards, Req, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ScraperService } from './scraper.service';
import { CrawlerService } from './crawler.service';
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
  constructor(
    private readonly scraperService: ScraperService,
    private readonly crawlerService: CrawlerService,
  ) { }

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

  /**
   * Trigger discovery & crawler run on-demand for an adapter or all adapters.
   * Creates detected items as "In Review" posts.
   */
  @Post('crawl')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @CheckPolicies({ action: Action.CREATE, resource: Resource.JOB })
  async triggerCrawl(
    @Body('adapter') adapter?: string,
    @Body('limit') limit?: number,
    @Body('maxAiExtract') maxAiExtract?: number,
  ) {
    const lim = limit && limit > 0 && limit <= 50 ? limit : 15;
    const maxAi = maxAiExtract && maxAiExtract > 0 && maxAiExtract <= 10 ? maxAiExtract : 3;

    if (adapter) {
      const result = await this.crawlerService.runCrawlForAdapter(adapter, lim, maxAi);
      return { success: true, result };
    }

    const results = await this.crawlerService.runCrawlForAll(lim, maxAi);
    return { success: true, results };
  }

  /**
   * Get discovery & crawler statistics and tracked sources
   */
  @Get('stats')
  @CheckPolicies({ action: Action.READ, resource: Resource.JOB })
  async getCrawlerStats() {
    return this.crawlerService.getStats();
  }
}
