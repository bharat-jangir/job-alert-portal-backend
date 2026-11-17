import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { AdapterRegistryService } from './adapters/adapter-registry.service';
import { DiscoveredCandidate, ISiteAdapter } from './adapters/site-adapter.interface';
import { ScraperService, ExtractedJobResult, CRAWLER_USER_AGENT } from './scraper.service';
import { ScrapedSource, ScrapedSourceDocument, ScrapedSourceStatus } from './schemas/scraped-source.schema';
import { JobsService, Actor } from '../jobs/jobs.service';
import { CreateJobDto } from '../jobs/dto/create-job.dto';
import { UpdateJobDto } from '../jobs/dto/update-job.dto';
import { evaluateGate, GateResult } from './quality-gate';
import { safeFetch } from '../../common/utils/safe-fetch';

export const CRAWLER_BOT_ID = '000000000000000000000000';

export interface CrawlRunResult {
  adapter: string;
  discovered: number;
  newCandidates: number;
  unchanged: number;
  processed: number; // posts created
  autoPublished: number; // of those, published with no review
  heldForReview: number; // of those, kept in review (gate failed or auto-publish off)
  updated: number; // existing posts refreshed because the source changed
  failed: number;
  errors: string[];
}

const HOUR = 3_600_000;
const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const sha256 = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex');

@Injectable()
export class CrawlerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrawlerService.name);
  private running = false;
  private timer?: NodeJS.Timeout;
  private lastRun?: { startedAt: Date; finishedAt?: Date; results: CrawlRunResult[]; error?: string };

  constructor(
    @InjectModel(ScrapedSource.name) private readonly sourceModel: Model<ScrapedSourceDocument>,
    private readonly adapterRegistry: AdapterRegistryService,
    private readonly scraperService: ScraperService,
    private readonly jobsService: JobsService,
    private readonly configService: ConfigService,
  ) {}

  // ───────────────────────── configuration ─────────────────────────
  private flag(key: string) { return this.configService.get<string>(key) === 'true'; }
  private num(key: string, def: number) {
    const n = Number(this.configService.get<string>(key));
    return Number.isFinite(n) && n > 0 ? n : def;
  }
  get autoPublishEnabled() { return this.flag('CRAWLER_AUTO_PUBLISH'); }
  private get minConfidence() { return this.num('CRAWLER_MIN_CONFIDENCE', 70); }
  private get dailyCap() { return this.num('CRAWLER_MAX_AUTO_PUBLISH_PER_DAY', 30); }
  private get maxAttempts() { return this.num('CRAWLER_MAX_ATTEMPTS', 3); }
  private get delayMs() {
    const v = this.configService.get<string>('CRAWLER_DELAY_MS');
    return v === undefined || v === '' ? 1500 : Math.max(0, Number(v) || 0);
  }

  // ───────────────────────── scheduling ─────────────────────────
  onModuleInit() {
    if (!this.flag('ENABLE_CRAWLER_SCHEDULER')) {
      this.logger.log('Crawler scheduler is OFF (set ENABLE_CRAWLER_SCHEDULER=true to enable).');
      return;
    }
    const minutes = Math.max(15, this.num('CRAWLER_INTERVAL_MINUTES', 120));
    this.timer = setInterval(() => void this.runScheduled(), minutes * 60_000);
    this.timer.unref?.();
    this.logger.log(`Crawler scheduler ON: every ${minutes} min. Auto-publish is ${this.autoPublishEnabled ? 'ON' : 'OFF (posts go to review)'}.`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runScheduled() {
    const started = this.startCrawl(undefined, this.num('CRAWLER_LIMIT_PER_RUN', 15), this.num('CRAWLER_MAX_AI_PER_RUN', 5));
    if (!started.started) this.logger.warn(`Scheduled crawl skipped: ${started.reason}`);
  }

  // ───────────────────────── running ─────────────────────────
  /** Starts a crawl in the background (HTTP callers must not wait minutes). One run at a time. */
  startCrawl(adapterKey: string | undefined, limit: number, maxAi: number): { started: boolean; reason?: string } {
    if (this.running) return { started: false, reason: 'a crawl is already running' };
    if (adapterKey && !this.adapterRegistry.getAdapter(adapterKey)) return { started: false, reason: `unknown adapter '${adapterKey}'` };
    this.running = true;
    const run = { startedAt: new Date(), results: [] as CrawlRunResult[] } as NonNullable<CrawlerService['lastRun']>;
    this.lastRun = run;
    void (async () => {
      try {
        const adapters = adapterKey ? [this.adapterRegistry.getAdapter(adapterKey)!] : this.adapterRegistry.getAllAdapters();
        for (const a of adapters) run.results.push(await this.crawlAdapter(a, limit, maxAi));
      } catch (e: any) {
        run.error = e?.message ?? String(e);
        this.logger.error(`Crawl run failed: ${run.error}`, e?.stack);
      } finally {
        run.finishedAt = new Date();
        this.running = false;
      }
    })();
    return { started: true };
  }

  /** Awaitable single-adapter crawl (used by tests and scripts). */
  async runCrawlForAdapter(adapterKey: string, limit = 15, maxAi = 5): Promise<CrawlRunResult> {
    const adapter = this.adapterRegistry.getAdapter(adapterKey);
    if (!adapter) throw new Error(`Adapter with key '${adapterKey}' not found.`);
    return this.crawlAdapter(adapter, limit, maxAi);
  }

  private async crawlAdapter(adapter: ISiteAdapter, limit: number, maxAi: number): Promise<CrawlRunResult> {
    const key = adapter.adapterKey;
    const res: CrawlRunResult = {
      adapter: key, discovered: 0, newCandidates: 0, unchanged: 0, processed: 0,
      autoPublished: 0, heldForReview: 0, updated: 0, failed: 0, errors: [],
    };
    const budget = { used: 0, max: maxAi };

    let candidates: DiscoveredCandidate[] = [];
    try {
      candidates = await adapter.discoverCandidates(limit);
    } catch (e: any) {
      res.errors.push(`discovery failed: ${e.message}`);
      this.logger.error(`[${key}] discovery failed: ${e.message}`);
      return res;
    }
    res.discovered = candidates.length;

    for (const c of candidates) {
      const outcome = await this.processCandidate(adapter, c, budget, res);
      if (outcome === 'stop') break;
    }
    this.logger.log(`[${key}] done: ${JSON.stringify({ ...res, errors: res.errors.length })}`);
    return res;
  }

  // ───────────────────────── one candidate ─────────────────────────
  private async processCandidate(
    adapter: ISiteAdapter,
    c: DiscoveredCandidate,
    budget: { used: number; max: number },
    res: CrawlRunResult,
  ): Promise<'stop' | void> {
    const key = adapter.adapterKey;
    let src = (await this.sourceModel.findOne({ url: c.url }).exec()) as ScrapedSourceDocument | null;
    try {
      if (src?.status === ScrapedSourceStatus.SKIPPED) return;
      // failed repeatedly: leave it alone until its back-off window ends
      if (src?.status === ScrapedSourceStatus.FAILED && src.attempts >= this.maxAttempts && src.nextAttemptAt && src.nextAttemptAt > new Date()) return;

      // 1. cheap change detection: fetch the page (no AI) and compare its text hash
      await sleep(this.delayMs);
      const scraped = await this.scraperService.scrapeUrl(c.url);
      const sourceHash = sha256(scraped.type === 'pdf' ? (scraped.content as Buffer) : String(scraped.content));
      const done = src && (src.status === ScrapedSourceStatus.IN_REVIEW || src.status === ScrapedSourceStatus.PUBLISHED);
      if (src && done && src.sourceHash === sourceHash) {
        res.unchanged++;
        await this.sourceModel.updateOne({ _id: src._id }, { $set: { lastCheckedAt: new Date() } });
        return;
      }

      // 2. AI budget: every attempt counts, successful or not (a broken URL must not burn money forever)
      if (!src) {
        res.newCandidates++;
        src = await this.createSource(adapter, c);
      }
      const doc: ScrapedSourceDocument = src;
      if (budget.used >= budget.max) {
        this.logger.log(`[${key}] AI budget (${budget.max}) used up; remaining candidates wait for the next run.`);
        return 'stop';
      }
      budget.used++;
      await this.sourceModel.updateOne({ _id: doc._id }, { $set: { status: ScrapedSourceStatus.PROCESSING } });

      // 3. extract + quality gate
      const extracted = await this.scraperService.extractWithAI(c.url, scraped, c.suggestedType);
      const isUpdate = !!doc.jobId;
      const gate = await this.runGate(adapter, extracted, c.url, isUpdate);

      if (isUpdate) await this.applyUpdate(doc, extracted, gate, sourceHash, res);
      else await this.createPost(doc, c, extracted, gate, sourceHash, res);
    } catch (e: any) {
      res.failed++;
      const detail = `${c.url}: ${e.message}`;
      res.errors.push(detail);
      this.logger.error(`[${key}] ${detail}`);
      if (src) {
        const attempts = (src.attempts ?? 0) + 1;
        const over = attempts - this.maxAttempts;
        await this.sourceModel.updateOne(
          { _id: src._id },
          {
            $set: {
              status: ScrapedSourceStatus.FAILED,
              errorMessage: String(e.message).slice(0, 500),
              attempts,
              lastCheckedAt: new Date(),
              ...(over >= 0 ? { nextAttemptAt: new Date(Date.now() + Math.min(24 * HOUR * 2 ** over, 7 * 24 * HOUR)) } : {}),
            },
          },
        );
      }
    }
  }

  private async createSource(adapter: ISiteAdapter, c: DiscoveredCandidate): Promise<ScrapedSourceDocument> {
    try {
      return (await this.sourceModel.create({
        url: c.url, adapterKey: adapter.adapterKey, title: c.title, suggestedType: c.suggestedType,
        status: ScrapedSourceStatus.DISCOVERED, metadata: c.metadata, lastCheckedAt: new Date(),
      })) as unknown as ScrapedSourceDocument;
    } catch (e: any) {
      if (e?.code === 11000) return (await this.sourceModel.findOne({ url: c.url }).exec()) as unknown as ScrapedSourceDocument; // lost a race
      throw e;
    }
  }

  private async runGate(adapter: ISiteAdapter, x: ExtractedJobResult, url: string, isUpdate: boolean): Promise<GateResult> {
    const linkReachable = x.applyLink ? await this.probeLink(x.applyLink) : undefined;
    const duplicate = isUpdate ? false : await this.jobsService.hasDuplicate(x.title, url);
    return evaluateGate(x, { ownDomains: adapter.ownDomains ?? [], linkReachable, duplicate, minConfidence: this.minConfidence });
  }

  /** false only when the link is clearly dead; bot-blocking responses (403/405/429) count as alive. */
  async probeLink(url: string): Promise<boolean> {
    try {
      const r = await safeFetch(url, { method: 'HEAD', timeoutMs: 8000, headers: { 'User-Agent': CRAWLER_USER_AGENT } });
      if (r.status >= 500 || r.status === 404 || r.status === 410) return false;
      return true;
    } catch {
      return false;
    }
  }

  private async autoPublishAllowed(): Promise<boolean> {
    if (!this.autoPublishEnabled) return false;
    const since = new Date(Date.now() - 24 * HOUR);
    return (await this.sourceModel.countDocuments({ autoPublishedAt: { $gte: since } })) < this.dailyCap;
  }

  // ───────────────────────── writing posts ─────────────────────────
  private toDto(x: ExtractedJobResult, c: DiscoveredCandidate) {
    return {
      title: x.title,
      slug: x.slug,
      type: x.type || c.suggestedType || 'job',
      description: x.description || x.shortDescription,
      organization: x.organization,
      location: x.location || 'All India',
      states: x.states && x.states.length ? x.states : ['All India'],
      salary: x.salary,
      qualification: x.qualification,
      experience: x.experience,
      lastDate: x.lastDate || undefined,
      applyLink: x.applyLink || undefined,
      eligibility: x.eligibility,
      totalVacancy: x.totalVacancy,
      ageLimit: x.ageLimit,
      importantDates: (x.importantDates || []).map((d) => ({ label: d.label, date: d.date || undefined })),
      metaTitle: x.metaTitle || x.title,
      metaDescription: x.metaDescription || x.shortDescription,
      tags: x.tags || [],
      sourceUrl: x.sourceUrl || c.url,
      sections: x.sections || [],
    };
  }

  /**
   * Adds the Hindi version of a post. Best effort: a failure (no API key, quota, bad output) never fails
   * the crawl, and a translation that does not pass the quality checks is simply not saved, so the post
   * stays English-only until a person translates it.
   */
  private async autoTranslate(jobId: string, title: string) {
    if (this.configService.get<string>('CRAWLER_AUTO_TRANSLATE') === 'false') return;
    if (!this.jobsService.canTranslate) return;
    try {
      const r = await this.jobsService.translate(jobId, { lang: 'hi', onlyIfAcceptable: true }, this.bot(false));
      this.logger.log(r.saved
        ? `Hindi added to "${title}" (${r.stats.strings} strings, ${r.stats.reverted} kept in English)`
        : `Hindi for "${title}" not saved: failed quality checks (${JSON.stringify(r.stats)})`);
    } catch (e: any) {
      this.logger.warn(`Hindi translation skipped for "${title}": ${e?.message}`);
    }
  }

  private bot(canPublish: boolean): Actor {
    return { id: CRAWLER_BOT_ID, email: 'crawler-bot@internal', role: 'editor' as Actor['role'], canPublish };
  }

  private async createPost(
    src: ScrapedSourceDocument, c: DiscoveredCandidate, x: ExtractedJobResult, gate: GateResult, sourceHash: string, res: CrawlRunResult,
  ) {
    const publish = gate.passed && (await this.autoPublishAllowed());
    const dto = { ...this.toDto(x, c), status: publish ? 'published' : 'review' } as CreateJobDto;
    const job = await this.jobsService.create(dto, this.bot(publish));
    const now = new Date();
    await this.sourceModel.updateOne(
      { _id: src._id },
      {
        $set: {
          status: publish ? ScrapedSourceStatus.PUBLISHED : ScrapedSourceStatus.IN_REVIEW,
          jobId: job._id, sourceHash, attempts: 0, lastCheckedAt: now, lastAutoWriteAt: now,
          gate: { passed: gate.passed, reasons: gate.reasons, confidence: x.confidence, at: now },
          autoPublished: publish,
          ...(publish ? { autoPublishedAt: now } : {}),
          revisionCount: (src.revisionCount || 0) + 1,
        },
        $unset: { errorMessage: '', nextAttemptAt: '', needsAttention: '' },
      },
    );
    await this.autoTranslate(String(job._id), job.title);
    res.processed++;
    if (publish) res.autoPublished++; else res.heldForReview++;
    this.logger.log(`[${src.adapterKey}] ${publish ? 'PUBLISHED' : 'held for review'}: "${job.title}"${gate.passed ? '' : ` — ${gate.reasons.join('; ')}`}`);
  }

  /** The source page changed after we already have a post for it. Never overwrite human work. */
  private async applyUpdate(src: ScrapedSourceDocument, x: ExtractedJobResult, gate: GateResult, sourceHash: string, res: CrawlRunResult) {
    const now = new Date();
    let job: any;
    try {
      job = await this.jobsService.findOne(String(src.jobId));
    } catch {
      // the post was deleted: forget it so the next run recreates it
      await this.sourceModel.updateOne({ _id: src._id }, { $unset: { jobId: '', sourceHash: '' }, $set: { status: ScrapedSourceStatus.DISCOVERED } });
      return;
    }
    const restoredStatus = job.status === 'published' ? ScrapedSourceStatus.PUBLISHED : ScrapedSourceStatus.IN_REVIEW;
    const flag = async (reason: string) => {
      await this.sourceModel.updateOne(
        { _id: src._id },
        { $set: { sourceHash, lastCheckedAt: now, status: restoredStatus, needsAttention: { reason, at: now }, gate: { passed: gate.passed, reasons: gate.reasons, confidence: x.confidence, at: now } } },
      );
      res.heldForReview++;
      this.logger.warn(`[${src.adapterKey}] source changed but post left untouched (${reason}): ${src.url}`);
    };
    const editedByHuman = job.lastEditorId && String(job.lastEditorId?._id ?? job.lastEditorId) !== CRAWLER_BOT_ID;
    if (editedByHuman) return flag('source changed, but a person has edited this post');
    if (!gate.passed) return flag(`source changed, new version failed checks: ${gate.reasons.join('; ')}`);

    const { slug: _s, type: _t, ...fields } = this.toDto(x, { url: src.url, title: src.title });
    await this.jobsService.update(
      String(job._id),
      { ...fields, revisionNote: 'Auto-updated from source' } as unknown as UpdateJobDto,
      this.bot(false),
    );
    await this.sourceModel.updateOne(
      { _id: src._id },
      {
        $set: {
          sourceHash, lastCheckedAt: now, lastAutoWriteAt: now, attempts: 0,
          gate: { passed: true, reasons: [], confidence: x.confidence, at: now },
          status: restoredStatus,
          revisionCount: (src.revisionCount || 0) + 1,
        },
        $unset: { errorMessage: '', needsAttention: '' },
      },
    );
    // the English text changed: refresh a machine Hindi version (a reviewed one is left for a person)
    await this.autoTranslate(String(job._id), job.title);
    res.updated++;
    this.logger.log(`[${src.adapterKey}] updated existing post from changed source: ${src.url}`);
  }

  // ───────────────────────── admin visibility ─────────────────────────
  async getStats() {
    const since = new Date(Date.now() - 24 * HOUR);
    const [total, inReview, published, discovered, failed, autoPublished24h, attention, recent] = await Promise.all([
      this.sourceModel.countDocuments(),
      this.sourceModel.countDocuments({ status: ScrapedSourceStatus.IN_REVIEW }),
      this.sourceModel.countDocuments({ status: ScrapedSourceStatus.PUBLISHED }),
      this.sourceModel.countDocuments({ status: ScrapedSourceStatus.DISCOVERED }),
      this.sourceModel.countDocuments({ status: ScrapedSourceStatus.FAILED }),
      this.sourceModel.countDocuments({ autoPublishedAt: { $gte: since } }),
      this.sourceModel
        .find({ $or: [{ needsAttention: { $exists: true } }, { 'gate.passed': false, status: ScrapedSourceStatus.IN_REVIEW }, { status: ScrapedSourceStatus.FAILED, attempts: { $gte: this.maxAttempts } }] })
        .sort({ updatedAt: -1 }).limit(25).populate('jobId', 'title slug type status').lean().exec(),
      this.sourceModel.find().sort({ updatedAt: -1 }).limit(10).populate('jobId', 'title slug type status').lean().exec(),
    ]);
    return {
      total, inReview, published, discovered, failed, autoPublished24h,
      running: this.running,
      lastRun: this.lastRun,
      config: {
        autoPublish: this.autoPublishEnabled,
        scheduler: this.flag('ENABLE_CRAWLER_SCHEDULER'),
        minConfidence: this.minConfidence,
        dailyCap: this.dailyCap,
      },
      needsAttention: attention.map((s: any) => ({
        _id: s._id, url: s.url, title: s.title, status: s.status, job: s.jobId,
        reasons: s.needsAttention?.reason ? [s.needsAttention.reason] : s.gate?.reasons?.length ? s.gate.reasons : s.errorMessage ? [s.errorMessage] : [],
        at: s.needsAttention?.at ?? s.gate?.at ?? s.updatedAt,
      })),
      recent,
      registeredAdapters: this.adapterRegistry.getAllAdapters().map((a) => ({ key: a.adapterKey, name: a.name })),
    };
  }
}
