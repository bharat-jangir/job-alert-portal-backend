import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { AdapterRegistryService } from './adapters/adapter-registry.service';
import { ScraperService, ExtractedJobResult } from './scraper.service';
import { ScrapedSource, ScrapedSourceDocument, ScrapedSourceStatus } from './schemas/scraped-source.schema';
import { JobsService, Actor } from '../jobs/jobs.service';
import { CreateJobDto } from '../jobs/dto/create-job.dto';
import { ConfigService } from '@nestjs/config';

export interface CrawlRunResult {
  adapter: string;
  discovered: number;
  newCandidates: number;
  processed: number;
  failed: number;
  errors: string[];
}

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);
  private isRunning = false;

  constructor(
    @InjectModel(ScrapedSource.name) private readonly sourceModel: Model<ScrapedSourceDocument>,
    private readonly adapterRegistry: AdapterRegistryService,
    private readonly scraperService: ScraperService,
    private readonly jobsService: JobsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Automated scheduled cron task.
   * Runs every 2 hours by default, or as configured by CRAWLER_CRON env.
   */
  @Cron(process.env.CRAWLER_CRON || CronExpression.EVERY_2_HOURS)
  async handleScheduledCrawl() {
    const isEnabled = this.configService.get<string>('ENABLE_CRAWLER_SCHEDULER') === 'true';
    if (!isEnabled) {
      this.logger.debug('Crawler scheduled run skipped: ENABLE_CRAWLER_SCHEDULER is not "true".');
      return;
    }

    this.logger.log('Starting scheduled crawl job across all registered adapters...');
    await this.runCrawlForAll();
  }

  /**
   * Run crawl across all registered adapters
   */
  async runCrawlForAll(limitPerAdapter = 15, maxAiExtractPerRun = 5): Promise<CrawlRunResult[]> {
    if (this.isRunning) {
      this.logger.warn('Crawl is already in progress. Skipping concurrent run.');
      return [];
    }

    this.isRunning = true;
    const results: CrawlRunResult[] = [];

    try {
      const adapters = this.adapterRegistry.getAllAdapters();
      for (const adapter of adapters) {
        const res = await this.runCrawlForAdapter(adapter.adapterKey, limitPerAdapter, maxAiExtractPerRun);
        results.push(res);
      }
    } finally {
      this.isRunning = false;
    }

    return results;
  }

  /**
   * Run the crawl & ingest pipeline for a specific adapter:
   * Discovery -> Change Detection -> AI Extraction -> Structure Validation -> "In Review" Post
   */
  async runCrawlForAdapter(adapterKey: string, limit = 20, maxAiExtract = 5): Promise<CrawlRunResult> {
    const adapter = this.adapterRegistry.getAdapter(adapterKey);
    if (!adapter) {
      throw new Error(`Adapter with key '${adapterKey}' not found.`);
    }

    this.logger.log(`[Crawler:${adapterKey}] Beginning discovery phase...`);
    const runResult: CrawlRunResult = {
      adapter: adapterKey,
      discovered: 0,
      newCandidates: 0,
      processed: 0,
      failed: 0,
      errors: [],
    };

    try {
      // Step 1: Automated Discovery
      const candidates = await adapter.discoverCandidates(limit);
      runResult.discovered = candidates.length;

      // Step 2: Change Detection & Tracking
      let processedInThisRun = 0;

      for (const candidate of candidates) {
        try {
          const existingSource = await this.sourceModel.findOne({ url: candidate.url }).exec();

          // If already successfully processed or reviewed, check if we need to skip or re-examine
          if (existingSource && (existingSource.status === ScrapedSourceStatus.IN_REVIEW || existingSource.status === ScrapedSourceStatus.PUBLISHED)) {
            // Update lastChecked timestamp
            await this.sourceModel.updateOne({ _id: existingSource._id }, { $set: { lastCheckedAt: new Date() } });
            continue;
          }

          // If new, record it in database
          let sourceDoc = existingSource;
          if (!sourceDoc) {
            runResult.newCandidates++;
            sourceDoc = await this.sourceModel.create({
              url: candidate.url,
              adapterKey,
              title: candidate.title,
              suggestedType: candidate.suggestedType,
              status: ScrapedSourceStatus.DISCOVERED,
              metadata: candidate.metadata,
              lastCheckedAt: new Date(),
            });
          }

          // Limit the number of AI Gemini calls per batch to respect rate limits & cost
          if (processedInThisRun >= maxAiExtract) {
            this.logger.log(`[Crawler:${adapterKey}] Reached batch limit (${maxAiExtract}) of AI extractions. Remaining queued for next run.`);
            break;
          }

          // Step 3 & 4: AI Extraction & Structure Validation
          this.logger.log(`[Crawler:${adapterKey}] Processing candidate: "${candidate.title}" -> ${candidate.url}`);
          await this.sourceModel.updateOne({ _id: sourceDoc._id }, { $set: { status: ScrapedSourceStatus.PROCESSING } });

          // Mark active processing
          const extracted: ExtractedJobResult = await this.scraperService.extractFromUrl(
            candidate.url,
            candidate.suggestedType || 'job',
          );

          // Compute content hash to detect future changes
          const contentHash = crypto
            .createHash('sha256')
            .update(JSON.stringify(extracted))
            .digest('hex');

          // Check if previously captured hash matches exactly
          if (sourceDoc.contentHash && sourceDoc.contentHash === contentHash && sourceDoc.jobId) {
            this.logger.log(`[Crawler:${adapterKey}] Content hash identical. No new changes detected for ${candidate.url}`);
            await this.sourceModel.updateOne(
              { _id: sourceDoc._id },
              { $set: { status: ScrapedSourceStatus.IN_REVIEW, lastCheckedAt: new Date() } },
            );
            continue;
          }

          // Step 5: Save as "In Review" Post
          const botActor: Actor = {
            id: '000000000000000000000000',
            email: 'crawler-bot@internal',
            role: 'editor',
            canPublish: false, // In review only
          };

          const postDto: CreateJobDto = {
            title: extracted.title,
            slug: extracted.slug,
            type: extracted.type || candidate.suggestedType || 'job',
            status: 'review', // Strictly creates as IN REVIEW
            description: extracted.description || extracted.shortDescription,
            organization: extracted.organization || 'Various Organizations',
            location: extracted.location || 'All India',
            states: extracted.states && extracted.states.length ? extracted.states : ['All India'],
            salary: extracted.salary || 'As per rules',
            qualification: extracted.qualification,
            experience: extracted.experience,
            lastDate: extracted.lastDate || undefined,
            applyLink: extracted.applyLink || candidate.url,
            eligibility: extracted.eligibility,
            totalVacancy: extracted.totalVacancy,
            ageLimit: extracted.ageLimit,
            importantDates: (extracted.importantDates || []).map((d) => ({
              label: d.label,
              date: d.date || undefined,
            })),
            metaTitle: extracted.metaTitle || extracted.title,
            metaDescription: extracted.metaDescription || extracted.shortDescription,
            tags: extracted.tags || [],
            sourceUrl: extracted.sourceUrl || candidate.url,
            sections: extracted.sections || [],
          };

          const createdJob = await this.jobsService.create(postDto, botActor);

          // Update Source tracker record
          await this.sourceModel.updateOne(
            { _id: sourceDoc._id },
            {
              $set: {
                status: ScrapedSourceStatus.IN_REVIEW,
                jobId: createdJob._id,
                contentHash,
                lastCheckedAt: new Date(),
                revisionCount: (sourceDoc.revisionCount || 0) + 1,
                errorMessage: undefined,
              },
            },
          );

          runResult.processed++;
          processedInThisRun++;
          this.logger.log(`[Crawler:${adapterKey}] Successfully created 'review' post: "${createdJob.title}" (ID: ${createdJob._id})`);
        } catch (itemErr: any) {
          runResult.failed++;
          const errDetail = `Error processing ${candidate.url}: ${itemErr.message}`;
          this.logger.error(`[Crawler:${adapterKey}] ${errDetail}`, itemErr.stack);
          runResult.errors.push(errDetail);

          await this.sourceModel.updateOne(
            { url: candidate.url },
            {
              $set: {
                status: ScrapedSourceStatus.FAILED,
                errorMessage: itemErr.message,
                lastCheckedAt: new Date(),
              },
            },
          );
        }
      }
    } catch (adapterErr: any) {
      this.logger.error(`[Crawler:${adapterKey}] Fatal adapter error: ${adapterErr.message}`, adapterErr.stack);
      runResult.errors.push(adapterErr.message);
    }

    return runResult;
  }

  /**
   * Get crawler statistics for admin dashboard
   */
  async getStats() {
    const total = await this.sourceModel.countDocuments();
    const inReview = await this.sourceModel.countDocuments({ status: ScrapedSourceStatus.IN_REVIEW });
    const discovered = await this.sourceModel.countDocuments({ status: ScrapedSourceStatus.DISCOVERED });
    const failed = await this.sourceModel.countDocuments({ status: ScrapedSourceStatus.FAILED });
    const recent = await this.sourceModel.find().sort({ updatedAt: -1 }).limit(10).populate('jobId', 'title slug type status').exec();

    return {
      total,
      inReview,
      discovered,
      failed,
      recent,
      registeredAdapters: this.adapterRegistry.getAllAdapters().map((a) => ({ key: a.adapterKey, name: a.name })),
    };
  }
}
