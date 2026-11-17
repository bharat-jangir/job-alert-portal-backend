import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, Interval } from '@nestjs/schedule';
import { FilterQuery, Model, Types } from 'mongoose';
import { Job, JobDocument } from './schemas/job.schema';
import { JobRevision, JobRevisionDocument } from './schemas/job-revision.schema';
import { JobCategory, JobCategoryDocument } from '../job-categories/schemas/job-category.schema';
import { Organization, OrganizationDocument } from '../organizations/schemas/organization.schema';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { QueryJobDto } from './dto/query-job.dto';
import { SectionsSchema, firstIssue } from './schemas/post-sections.schema';
import { CacheService } from '../../common/services/cache.service';
import { RevalidateService } from '../../common/services/revalidate.service';
import { escapeRegex, slugify } from '../../common/utils/text';
import { sanitizeContentHtml } from '../../common/utils/sanitize';
import { TranslationService } from '../translation/translation.service';
import {
  Lang, TranslatedLang, cardTranslationSelect, listTranslationExclusion, localizeCards, localizePost,
  normalizeLang, availableLanguages, PostTranslationSchema,
} from './i18n/languages';

/** Who is making the change. `canPublish` comes from the PUBLISH:Job policy. */
export interface Actor {
  id: string;
  email?: string;
  role?: string;
  canPublish: boolean;
}

/** Only posts matching this are visible on the public site. */
const LIVE = { status: 'published', isActive: { $ne: false } } as const;
const LIVE_STATUSES = ['published', 'scheduled', 'archived'];
/** Content fields copied back when restoring a revision (not identity / stats / status). */
const RESTORABLE_FIELDS = [
  'title', 'type', 'categoryId', 'organization', 'organizationId', 'location', 'states', 'salary',
  'qualification', 'experience', 'lastDate', 'applyLink', 'description', 'eligibility', 'totalVacancy',
  'ageLimit', 'importantDates', 'sections', 'htmlContent', 'metaTitle', 'metaDescription', 'canonicalUrl',
  'ogImage', 'tags', 'sourceUrl', 'updateNote', 'attachments', 'isBulletin', 'translations',
];
const MAX_REVISIONS = 30;
const MAX_PUBLIC_PAGE = 200;
const CARD_FIELDS =
  'title slug type organization organizationId location states lastDate publishedAt updatedAt totalVacancy description qualification isBulletin views';

@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobsService.name);
  /** Views / apply-clicks are batched in memory and flushed with one bulkWrite. */
  private counterBuffer = new Map<string, { views: number; applications: number }>();

  constructor(
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    @InjectModel(JobRevision.name) private revisionModel: Model<JobRevisionDocument>,
    @InjectModel(JobCategory.name) private categoryModel: Model<JobCategoryDocument>,
    @InjectModel(Organization.name) private orgModel: Model<OrganizationDocument>,
    private cache: CacheService,
    private revalidate: RevalidateService,
    private translator: TranslationService,
  ) {}

  /**
   * One-time, idempotent backfill for posts created before the workflow existed:
   * they were live (isActive) so they stay live; deactivated ones become archived.
   */
  async onApplicationBootstrap() {
    const res = await this.jobModel.collection.updateMany({ status: { $exists: false } }, [
      {
        $set: {
          status: { $cond: [{ $eq: ['$isActive', false] }, 'archived', 'published'] },
          publishedAt: { $ifNull: ['$publishedAt', '$createdAt'] },
        },
      },
    ]);
    if (res.modifiedCount) this.logger.log(`Backfilled workflow status on ${res.modifiedCount} existing posts`);
  }

  // ───────────────────────── write side ─────────────────────────

  /** `actor` is omitted only by trusted internal callers (seed scripts); those publish directly. */
  async create(dto: CreateJobDto, actor?: Actor): Promise<JobDocument> {
    const status = dto.status ?? (actor ? 'draft' : 'published');
    if (actor) this.assertCanSetStatus(actor, status);

    const data = await this.normalise(dto);
    data.slug = await this.uniqueSlug(dto.slug || slugify(dto.title));
    data.status = status;
    if (actor?.id && Types.ObjectId.isValid(actor.id)) {
      data.authorId = data.lastEditorId = new Types.ObjectId(actor.id);
    }
    this.applyStatusRules(data, status);

    const post = await new this.jobModel(data).save();
    this.afterWrite(post);
    return post;
  }

  /** Copies a post into a new draft (same content, fresh slug, no stats/history). */
  async duplicate(id: string, actor?: Actor): Promise<JobDocument> {
    const src: any = await this.jobModel.findById(id).lean().exec();
    if (!src) throw new NotFoundException(`Job with ID ${id} not found`);
    const iso = (d: any) => (d ? new Date(d).toISOString() : undefined);
    const dto: any = {
      title: `${src.title} (Copy)`.slice(0, 300),
      slug: `${src.slug}-copy`.slice(0, 120),
      status: 'draft',
      type: src.type,
      isBulletin: false,
      isActive: src.isActive,
      htmlContent: src.htmlContent,
      sections: src.sections,
      organization: src.organization,
      organizationId: src.organizationId ? String(src.organizationId) : undefined,
      location: src.location, states: src.states, salary: src.salary,
      qualification: src.qualification, experience: src.experience,
      lastDate: iso(src.lastDate), applyLink: src.applyLink, description: src.description,
      eligibility: src.eligibility, totalVacancy: src.totalVacancy, ageLimit: src.ageLimit,
      importantDates: (src.importantDates || []).map((d: any) => ({ label: d.label, date: iso(d.date) })),
      metaTitle: src.metaTitle, metaDescription: src.metaDescription,
      ogImage: src.ogImage, tags: src.tags, sourceUrl: src.sourceUrl,
      attachments: src.attachments,
      // canonicalUrl intentionally not copied: it would point two posts at the same canonical
    };
    for (const k of Object.keys(dto)) if (dto[k] === undefined || dto[k] === null) delete dto[k];
    return this.create(dto, actor);
  }

  async update(id: string, dto: UpdateJobDto, actor?: Actor): Promise<JobDocument> {
    const existing = await this.jobModel.findById(id).exec();
    if (!existing) throw new NotFoundException(`Job with ID ${id} not found`);

    const { revisionNote, ...rest } = dto;
    if (actor && rest.status && rest.status !== existing.status) {
      // moving into or out of a live state is a publishing decision
      this.assertCanSetStatus(actor, rest.status);
      if (LIVE_STATUSES.includes(existing.status) && !actor.canPublish) {
        throw new ForbiddenException('Only a publisher can change the status of a live post');
      }
    }

    const data = await this.normalise(rest as CreateJobDto);
    const update: Record<string, any> = { $set: data };

    if (rest.slug && rest.slug !== existing.slug) {
      data.slug = await this.uniqueSlug(rest.slug, id);
      update.$addToSet = { previousSlugs: existing.slug };
    } else {
      delete data.slug;
    }
    if (rest.status) {
      data.status = rest.status;
      this.applyStatusRules(data, rest.status, existing);
    }
    if (actor?.id && Types.ObjectId.isValid(actor.id)) data.lastEditorId = new Types.ObjectId(actor.id);

    await this.snapshot(existing, actor, revisionNote);

    const post = await this.jobModel.findByIdAndUpdate(id, update, { new: true, runValidators: true }).exec();
    if (!post) throw new NotFoundException(`Job with ID ${id} not found`);
    this.afterWrite(post, existing.slug);
    return post;
  }

  async remove(id: string): Promise<void> {
    const post = await this.jobModel.findByIdAndDelete(id).exec();
    if (!post) throw new NotFoundException(`Job with ID ${id} not found`);
    await this.revisionModel.deleteMany({ postId: post._id }).exec();
    this.afterWrite(post);
  }

  async toggleBulletin(id: string): Promise<Job> {
    const post = await this.jobModel.findById(id).exec();
    if (!post) throw new NotFoundException(`Job with ID ${id} not found`);
    post.isBulletin = !post.isBulletin;
    await post.save();
    this.afterWrite(post);
    return post;
  }

  // ───────────────────────── revisions ─────────────────────────

  listRevisions(postId: string) {
    return this.revisionModel
      .find({ postId })
      .sort({ version: -1 })
      .select('version editorName note createdAt')
      .limit(MAX_REVISIONS)
      .lean()
      .exec();
  }

  async restoreRevision(postId: string, revisionId: string, actor?: Actor) {
    const [post, revision] = await Promise.all([
      this.jobModel.findById(postId).exec(),
      this.revisionModel.findOne({ _id: revisionId, postId }).lean().exec(),
    ]);
    if (!post || !revision) throw new NotFoundException('Revision not found');

    await this.snapshot(post, actor, `Before restoring v${revision.version}`);
    const patch: Record<string, any> = {};
    for (const f of RESTORABLE_FIELDS) if (f in revision.snapshot) patch[f] = revision.snapshot[f];
    if (actor?.id && Types.ObjectId.isValid(actor.id)) patch.lastEditorId = new Types.ObjectId(actor.id);
    const restored = await this.jobModel.findByIdAndUpdate(postId, { $set: patch }, { new: true }).exec();
    this.afterWrite(restored!);
    return restored;
  }

  private async snapshot(post: JobDocument, actor?: Actor, note?: string) {
    const last = await this.revisionModel.findOne({ postId: post._id }).sort({ version: -1 }).select('version').lean();
    const version = (last?.version ?? 0) + 1;
    const { _id, __v, ...snapshot } = post.toObject() as any;
    await this.revisionModel.create({
      postId: post._id,
      version,
      snapshot,
      editorId: actor?.id && Types.ObjectId.isValid(actor.id) ? new Types.ObjectId(actor.id) : undefined,
      editorName: actor?.email,
      note,
    });
    if (version > MAX_REVISIONS) {
      await this.revisionModel.deleteMany({ postId: post._id, version: { $lte: version - MAX_REVISIONS } });
    }
  }

  // ───────────────────────── admin reads ─────────────────────────

  /** All statuses, newest edit first. Same `{ jobs, total }` shape as the public list. */
  async adminList(query: QueryJobDto) {
    const { page = 1, limit = 10 } = query;
    const filter = this.buildFilter(query, query.status ? { status: query.status } : {});
    const [jobs, total] = await Promise.all([
      this.jobModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('title slug type status organization location lastDate publishedAt scheduledAt isBulletin isActive views updatedAt translations.hi.title translations.hi.status')
        .lean()
        .exec(),
      this.jobModel.countDocuments(filter),
    ]);
    return { jobs, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** By ID, any status (admin edit screen). */
  /** True if a post (any status) already uses this source URL or has exactly this title. */
  async hasDuplicate(title: string, sourceUrl?: string): Promise<boolean> {
    const or: any[] = [{ title: new RegExp(`^${escapeRegex(title.trim())}$`, 'i') }];
    if (sourceUrl) or.push({ sourceUrl });
    return !!(await this.jobModel.exists({ $or: or }));
  }

  async findOne(id: string): Promise<Job> {
    const job = await this.jobModel.findById(id).populate('organizationId').exec();
    if (!job) throw new NotFoundException(`Job with ID ${id} not found`);
    return job;
  }

  // ───────────────────────── public reads ─────────────────────────

  async findAll(query: QueryJobDto): Promise<{ jobs: Job[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.min(query.page ?? 1, MAX_PUBLIC_PAGE);
    const limit = query.limit ?? 10;
    const lang = normalizeLang(query.lang);
    const filter = this.buildFilter(query, { ...LIVE });
    if (query.isActive === false) filter.isActive = false; // legacy filter, still honoured

    const [jobs, total] = await Promise.all([
      this.jobModel
        .find(filter)
        .sort({ publishedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(`-htmlContent -sections -tags -eligibility -previousSlugs -authorId -lastEditorId ${listTranslationExclusion(lang)}`)
        .populate('organizationId', 'name slug')
        .lean()
        .exec(),
      this.jobModel.countDocuments(filter),
    ]);
    return { jobs: localizeCards(jobs as any[], lang) as any, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Public detail. If `slug` is an old slug the *current* post is returned (its `slug` differs
   * from the request) so the site can answer with a permanent redirect.
   */
  async findBySlug(slug: string, langInput?: string): Promise<any> {
    if (!slug) throw new NotFoundException('Slug is required');
    const lang = normalizeLang(langInput);
    const select = '-previousSlugs -authorId -lastEditorId';
    let job: any = await this.jobModel.findOne({ slug, ...LIVE }).select(select).populate('organizationId').lean().exec();
    if (!job) {
      job = await this.jobModel.findOne({ previousSlugs: slug, ...LIVE }).select(select).populate('organizationId').lean().exec();
    }
    if (!job) throw new NotFoundException(`Job with slug ${slug} not found`);
    // English with the requested translation laid over it, plus which languages exist (for hreflang)
    return localizePost(job, lang);
  }

  /** Same-type posts, preferring the same organization. */
  async findRelated(slug: string, langInput?: string, limit = 6) {
    const lang = normalizeLang(langInput);
    const fields = `${CARD_FIELDS} ${cardTranslationSelect(lang)}`;
    const post = await this.jobModel.findOne({ slug, ...LIVE }).select('type organization').lean();
    if (!post) return [];
    const base = { ...LIVE, type: post.type, slug: { $ne: slug } };
    const same = post.organization
      ? await this.jobModel.find({ ...base, organization: post.organization }).sort({ publishedAt: -1 }).limit(limit).select(fields).lean()
      : [];
    if (same.length >= limit) return localizeCards(same, lang);
    const rest = await this.jobModel
      .find({ ...base, _id: { $nin: same.map((p) => p._id) } })
      .sort({ publishedAt: -1 })
      .limit(limit - same.length)
      .select(fields)
      .lean();
    return localizeCards([...same, ...rest], lang);
  }

  async findBulletins(langInput?: string): Promise<any[]> {
    const lang = normalizeLang(langInput);
    const rows = await this.jobModel
      .find({ ...LIVE, isBulletin: true })
      .select(listTranslationExclusion(lang))
      .populate('organizationId')
      .sort({ publishedAt: -1, updatedAt: -1 })
      .limit(50)
      .lean()
      .exec();
    return localizeCards(rows, lang);
  }

  findUpcomingDeadlines(langInput?: string): Promise<any[]> {
    const lang = normalizeLang(langInput);
    return this.cache.wrap(`jobs:deadlines:${lang}`, 60_000, async () =>
      localizeCards(
        await this.jobModel
          .find({ ...LIVE, lastDate: { $gt: new Date() } })
          .sort({ lastDate: 1 })
          .limit(10)
          .select(`${CARD_FIELDS} ${cardTranslationSelect(lang)}`)
          .lean()
          .exec(),
        lang,
      ),
    );
  }

  async findPopularJobs(langInput?: string): Promise<any[]> {
    const lang = normalizeLang(langInput);
    const rows = await this.jobModel
      .find(LIVE)
      .select(listTranslationExclusion(lang))
      .sort({ views: -1, applications: -1 })
      .populate('organizationId', 'name slug')
      .limit(10)
      .lean()
      .exec();
    return localizeCards(rows, lang);
  }

  async findJobsByOrganization(organization: string, langInput?: string): Promise<any[]> {
    const lang = normalizeLang(langInput);
    const rows = await this.jobModel
      .find({ ...LIVE, organization })
      .select(listTranslationExclusion(lang))
      .sort({ publishedAt: -1 })
      .limit(200)
      .lean()
      .exec();
    return localizeCards(rows, lang);
  }

  async searchJobs(query: string, langInput?: string) {
    const lang = normalizeLang(langInput);
    const term = (query ?? '').trim();
    if (term.length < 2) return [];
    const rx = new RegExp(escapeRegex(term.slice(0, 80)), 'i');
    const rows = await this.jobModel
      .find({
        ...LIVE,
        $or: [
          { title: rx }, { description: rx }, { organization: rx }, { location: rx }, { tags: rx },
          // Hindi titles are searchable from either language
          { 'translations.hi.title': rx }, { 'translations.hi.description': rx },
        ],
      })
      .sort({ publishedAt: -1 })
      .limit(30)
      .select(`_id title slug type organization ${cardTranslationSelect(lang)}`)
      .lean()
      .exec();
    return localizeCards(rows, lang);
  }

  async findLatestJobs(limit = 15, langInput?: string): Promise<any[]> {
    const lang = normalizeLang(langInput);
    const rows = await this.jobModel
      .find(LIVE)
      .sort({ publishedAt: -1 })
      .select(`_id title slug type organization organizationId lastDate publishedAt ${cardTranslationSelect(lang)}`)
      .populate('organizationId', 'name slug')
      .limit(Math.min(Math.max(limit || 15, 1), 200))
      .lean()
      .exec();
    return localizeCards(rows, lang);
  }

  async findByType(type: string, langInput?: string): Promise<any[]> {
    const lang = normalizeLang(langInput);
    const rows = await this.jobModel
      .find({ ...LIVE, type })
      .select(`title slug location lastDate organization publishedAt ${cardTranslationSelect(lang)}`)
      .populate('organizationId', 'name slug')
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(500)
      .lean()
      .exec();
    return localizeCards(rows, lang);
  }

  getDistinctOrganizations(): Promise<string[]> {
    return this.jobModel.distinct('organization', LIVE).exec() as Promise<string[]>;
  }

  /** Everything the homepage needs in one cached call. */
  home(langInput?: string) {
    const lang = normalizeLang(langInput);
    const tr = cardTranslationSelect(lang);
    return this.cache.wrap(`jobs:home:${lang}`, 30_000, async () => {
      const categories = await this.categoryModel.find({ isDeleted: false, showOnHome: true }).sort({ sequenceNo: 1 }).lean();
      const [bulletins, popular, ...lists] = await Promise.all([
        this.jobModel.find({ ...LIVE, isBulletin: true }).sort({ publishedAt: -1 }).limit(30).select(`title slug type publishedAt lastDate ${tr}`).lean(),
        this.jobModel.find(LIVE).sort({ views: -1 }).limit(10).select(`${CARD_FIELDS} ${tr}`).lean(),
        ...categories.map((c) =>
          this.jobModel.find({ ...LIVE, type: c.slug }).sort({ publishedAt: -1 }).limit(15).select(`${CARD_FIELDS} ${tr}`).lean(),
        ),
      ]);
      return {
        bulletins: localizeCards(bulletins, lang),
        popular: localizeCards(popular, lang),
        sections: categories.map((c, i) => ({
          category: {
            _id: c._id, name: c.name, slug: c.slug,
            displayName: (lang === 'hi' && c.displayNameHi) || c.displayName || c.name,
          },
          items: localizeCards(lists[i], lang),
        })),
      };
    });
  }

  /** Minimal feed for XML sitemaps. */
  sitemap() {
    return this.cache.wrap('jobs:sitemap', 5 * 60_000, () =>
      this.jobModel
        .find(LIVE).sort({ publishedAt: -1 }).limit(50_000)
        .select('type slug updatedAt publishedAt translations.hi.title')
        .lean().exec()
        // `languages` lets the sitemap emit hreflang alternates only for posts that really have a translation
        .then((rows: any[]) => rows.map(({ translations, ...r }) => ({ ...r, languages: availableLanguages({ translations }) }))),
    );
  }

  /** Counts for hub pages (states, qualifications, organizations). */
  facets() {
    return this.cache.wrap('jobs:facets', 5 * 60_000, async () => {
      const match = { $match: { status: 'published', isActive: { $ne: false } } };
      const [states, qualifications, organizations] = await Promise.all([
        this.jobModel.aggregate([match, { $unwind: '$states' }, { $group: { _id: '$states', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }]),
        this.jobModel.aggregate([
          { $match: { ...match.$match, qualification: { $exists: true } } },
          { $group: { _id: '$qualification', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
        this.jobModel.aggregate([
          { $match: { ...match.$match, organizationId: { $exists: true } } },
          { $group: { _id: '$organizationId', name: { $first: '$organization' }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 100 },
        ]),
      ]);
      return {
        states: states.map((s) => ({ name: s._id, count: s.count })),
        qualifications: qualifications.map((s) => ({ name: s._id, count: s.count })),
        organizations: organizations.map((o) => ({ _id: o._id, name: o.name, count: o.count })),
      };
    });
  }

  /** Numbers for the admin dashboard. */
  async stats() {
    const [byStatus, byType, totals, recent, pendingReview] = await Promise.all([
      this.jobModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      this.jobModel.aggregate([{ $match: { status: 'published' } }, { $group: { _id: '$type', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      this.jobModel.aggregate([{ $group: { _id: null, views: { $sum: '$views' }, applications: { $sum: '$applications' } } }]),
      this.jobModel.find().sort({ updatedAt: -1 }).limit(8).select('title type status updatedAt').lean(),
      this.jobModel.find({ status: 'review' }).sort({ updatedAt: -1 }).limit(8).select('title type updatedAt').lean(),
    ]);
    const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
    return {
      posts: {
        total: byStatus.reduce((n, s) => n + s.count, 0),
        published: counts.published ?? 0,
        draft: counts.draft ?? 0,
        review: counts.review ?? 0,
        scheduled: counts.scheduled ?? 0,
        archived: counts.archived ?? 0,
      },
      byType: byType.map((t) => ({ type: t._id, count: t.count })),
      totalViews: totals[0]?.views ?? 0,
      totalApplyClicks: totals[0]?.applications ?? 0,
      recent,
      pendingReview,
    };
  }

  // ───────────────────────── counters (batched) ─────────────────────────

  trackView(id: string) {
    this.bump(id, 'views');
  }

  trackApply(id: string) {
    this.bump(id, 'applications');
  }

  private bump(id: string, field: 'views' | 'applications') {
    if (!Types.ObjectId.isValid(id)) return;
    const cur = this.counterBuffer.get(id) ?? { views: 0, applications: 0 };
    cur[field]++;
    this.counterBuffer.set(id, cur);
  }

  @Interval(15_000)
  async flushCounters() {
    if (this.counterBuffer.size === 0) return;
    const batch = this.counterBuffer;
    this.counterBuffer = new Map();
    try {
      await this.jobModel.bulkWrite(
        [...batch].map(([id, c]) => ({
          updateOne: { filter: { _id: new Types.ObjectId(id) }, update: { $inc: { views: c.views, applications: c.applications } } },
        })),
        { ordered: false },
      );
    } catch (err: any) {
      this.logger.warn(`Counter flush failed: ${err?.message}`);
    }
  }

  async onApplicationShutdown() {
    await this.flushCounters();
  }

  // ───────────────────────── scheduled publishing ─────────────────────────

  @Cron('* * * * *')
  async publishDue() {
    const due = await this.jobModel.find({ status: 'scheduled', scheduledAt: { $lte: new Date() } }).limit(100).exec();
    for (const post of due) {
      post.status = 'published';
      post.publishedAt = post.scheduledAt ?? new Date();
      await post.save();
      this.afterWrite(post);
      this.logger.log(`Published scheduled post "${post.slug}"`);
    }
  }

  // ───────────────────────── helpers ─────────────────────────

  /** Going live (published / scheduled / archived) needs PUBLISH. Drafts and review are open to editors. */
  private assertCanSetStatus(actor: Actor, status: string) {
    if (!actor.canPublish && LIVE_STATUSES.includes(status)) {
      throw new ForbiddenException('You can save drafts or submit for review. Publishing needs a publisher.');
    }
  }

  private applyStatusRules(data: Record<string, any>, status: string, existing?: JobDocument) {
    if (status === 'published' && !existing?.publishedAt && !data.publishedAt) data.publishedAt = new Date();
    if (status === 'scheduled') {
      const at = data.scheduledAt ?? existing?.scheduledAt;
      if (!at || new Date(at) <= new Date()) {
        throw new BadRequestException('Scheduled posts need a scheduledAt date in the future');
      }
    }
  }

  private buildFilter(query: QueryJobDto, base: FilterQuery<JobDocument>): FilterQuery<JobDocument> {
    const filter: FilterQuery<JobDocument> = { ...base };
    if (query.type) filter.type = query.type;
    if (query.organization) filter.organization = query.organization;
    if (query.organizationId) filter.organizationId = new Types.ObjectId(query.organizationId);
    if (query.location) filter.location = query.location;
    if (query.state) filter.states = query.state;
    if (query.experience) filter.experience = query.experience;
    if (query.qualification) filter.qualification = query.qualification;
    if (query.tag) filter.tags = query.tag;
    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ title: rx }, { description: rx }, { organization: rx }, { tags: rx }, { 'translations.hi.title': rx }];
    }
    return filter;
  }

  private async uniqueSlug(base: string, excludeId?: string) {
    const root = slugify(base);
    let slug = root;
    for (let i = 2; i < 200; i++) {
      const clash = await this.jobModel.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).exec();
      if (!clash) return slug;
      slug = `${root}-${i}`;
    }
    return `${root}-${Date.now().toString(36)}`;
  }

  /** Validates references, sanitises HTML and coerces dates. Returns only the fields that were supplied. */
  private async normalise(dto: Partial<CreateJobDto>): Promise<Record<string, any>> {
    const data: Record<string, any> = { ...dto };
    delete data.status;

    if (dto.type !== undefined) {
      const category = await this.categoryModel.findOne({ slug: dto.type, isDeleted: false }).lean();
      if (!category) throw new BadRequestException(`Unknown post type "${dto.type}"`);
      data.categoryId = category._id;
    } else if (dto.categoryId) {
      const category = await this.categoryModel.findById(dto.categoryId).lean();
      if (!category) throw new BadRequestException('Category not found');
      data.type = category.slug;
    }

    if (dto.organizationId) {
      const org = await this.orgModel.findById(dto.organizationId).lean();
      if (!org) throw new BadRequestException('Organization not found');
      data.organizationId = org._id;
      data.organization = org.name; // keep the denormalised name consistent
    }

    if (dto.sections !== undefined) {
      const parsed = SectionsSchema.safeParse(dto.sections);
      if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
      data.sections = parsed.data.map((s) => (s.type === 'html' ? { ...s, html: sanitizeContentHtml(s.html) } : s));
    }
    if (dto.translations !== undefined) data.translations = this.normaliseTranslations(dto.translations);
    if (dto.htmlContent !== undefined) data.htmlContent = sanitizeContentHtml(dto.htmlContent);
    if (dto.eligibility !== undefined) data.eligibility = sanitizeContentHtml(dto.eligibility);

    if (dto.importantDates !== undefined) {
      data.importantDates = dto.importantDates
        .filter((d) => d.label || d.date)
        .map((d) => ({ label: d.label, date: d.date ? new Date(d.date) : undefined }));
    }
    if (dto.lastDate) data.lastDate = new Date(dto.lastDate);
    if (dto.scheduledAt) data.scheduledAt = new Date(dto.scheduledAt);
    if (dto.states) data.states = [...new Set(dto.states.map((s) => s.trim()).filter(Boolean))];
    if (dto.tags) data.tags = [...new Set(dto.tags.map((s) => s.trim()).filter(Boolean))];

    for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
    return data;
  }

  /** Validates, sanitises and stamps each language's text. Empty strings are dropped so they fall back to English. */
  private normaliseTranslations(input: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [lang, raw] of Object.entries(input ?? {})) {
      if (!raw) continue;
      const parsed = PostTranslationSchema.safeParse(raw);
      if (!parsed.success) {
        const i = parsed.error.issues[0];
        throw new BadRequestException(`translations.${lang}.${i.path.join('.')}: ${i.message}`);
      }
      const t: Record<string, any> = { ...parsed.data, translatedAt: new Date() };
      for (const k of Object.keys(t)) if (t[k] === '' || t[k] === undefined) delete t[k];
      if (t.eligibility) t.eligibility = sanitizeContentHtml(t.eligibility);
      if (t.sections) t.sections = t.sections.map((s: any) => (s.type === 'html' ? { ...s, html: sanitizeContentHtml(s.html) } : s));
      out[lang] = t;
    }
    return out;
  }

  /**
   * Machine-translates a post's text and stores it under `translations[lang]`.
   * A translation a person marked `reviewed` is never replaced unless `force` is set.
   * With `onlyIfAcceptable` (the crawler) a translation that fails the quality checks is not saved.
   */
  async translate(
    id: string,
    opts: { lang?: TranslatedLang; force?: boolean; onlyIfAcceptable?: boolean } = {},
    actor?: Actor,
  ) {
    const lang = opts.lang ?? 'hi';
    const post: any = await this.jobModel.findById(id).lean().exec();
    if (!post) throw new NotFoundException(`Job with ID ${id} not found`);
    if (post.translations?.[lang]?.status === 'reviewed' && !opts.force) {
      throw new BadRequestException('This translation was reviewed by a person. Use "Re-translate anyway" to replace it.');
    }
    const result = await this.translator.translatePost(post, lang);
    if (opts.onlyIfAcceptable && !result.acceptable) return { saved: false, ...result };

    const existing = await this.jobModel.findById(id).exec();
    if (existing) await this.snapshot(existing, actor, `Before ${lang} translation`);
    const updated = await this.jobModel
      .findByIdAndUpdate(id, { $set: { [`translations.${lang}`]: result.translation } }, { new: true })
      .exec();
    if (updated) this.afterWrite(updated);
    return { saved: true, ...result };
  }

  get canTranslate(): boolean {
    return this.translator.available;
  }

  /** Bust caches and tell the public site which pages changed. */
  private afterWrite(post: JobDocument, oldSlug?: string) {
    this.cache.invalidate('jobs:');
    const tags = ['posts', 'home', 'sitemap', `type:${post.type}`, `post:${post.slug}`];
    if (oldSlug && oldSlug !== post.slug) tags.push(`post:${oldSlug}`);
    this.revalidate.trigger({ tags });
  }
}
