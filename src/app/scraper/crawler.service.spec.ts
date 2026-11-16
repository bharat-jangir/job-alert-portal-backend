// cheerio ships ESM and the Gemini SDK needs a key: neither is used by these tests
jest.mock('cheerio', () => ({}));
jest.mock('@google/generative-ai', () => ({ GoogleGenerativeAI: class {} }));
// the real JobsService pulls in @nestjs/schedule (ESM) and Mongoose models; the tests inject a fake
jest.mock('../jobs/jobs.service', () => ({ JobsService: class {} }));

import { CrawlerService, CRAWLER_BOT_ID } from './crawler.service';
import { ScrapedSourceStatus } from './schemas/scraped-source.schema';
import { evaluateGate } from './quality-gate';

const DAY = 86_400_000;
const goodExtract = (over: any = {}) => ({
  title: 'SSC CGL 2026 Recruitment: Apply Online for 17,727 Posts',
  type: 'job',
  description: 'The Staff Selection Commission has released the CGL 2026 notification for 17,727 posts. Graduates can apply online until the last date.',
  organization: 'Staff Selection Commission',
  location: 'All India', states: ['All India'], salary: '₹25,500 – ₹81,100',
  lastDate: new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10),
  applyLink: 'https://ssc.gov.in/apply', totalVacancy: '17,727 Posts',
  importantDates: [{ label: 'Last Date', date: new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10) }],
  metaTitle: 'SSC CGL 2026: Apply Online, Dates, Vacancy',
  metaDescription: 'SSC CGL 2026 notification out for 17,727 posts. Check eligibility, last date, fee and how to apply online on the official website today.',
  tags: ['ssc'], sourceUrl: 'https://agg.example/post-1', confidence: 92, uncertainFields: [],
  sections: [
    { type: 'callout', tone: 'info', text: 'Applications are open.' },
    { type: 'heading', level: 2, text: 'Important Dates' },
    { type: 'table', headers: ['Event', 'Date'], rows: [['Last date', '30 days'], ['Exam', 'later']] },
    { type: 'list', ordered: false, items: ['Graduate', 'Age 18-32'] },
  ],
  ...over,
});

function harness(config: Record<string, string> = {}, opts: { adapterUrls?: string[] } = {}) {
  const sources: any[] = [];
  let seq = 0;
  const match = (d: any, f: any) => Object.entries(f).every(([k, v]: any) => (v && typeof v === 'object' && '$gte' in v ? d[k] >= v.$gte : String(d[k]) === String(v)));
  const sourceModel: any = {
    findOne: (f: any) => ({ exec: async () => { const d = sources.find((x) => match(x, f)); return d ? { ...d } : null; } }),
    create: async (d: any) => { const doc = { _id: `s${++seq}`, attempts: 0, autoPublished: false, revisionCount: 0, ...d }; sources.push(doc); return { ...doc }; },
    updateOne: async (f: any, u: any) => {
      const d = sources.find((x) => match(x, f))!;
      Object.assign(d, u.$set ?? {});
      for (const k of Object.keys(u.$unset ?? {})) delete d[k];
    },
    countDocuments: async (f: any = {}) => sources.filter((x) => match(x, f)).length,
  };
  const urls = opts.adapterUrls ?? ['https://agg.example/post-1'];
  const adapter: any = {
    adapterKey: 'agg', name: 'Aggregator', ownDomains: ['agg.example'],
    discoverCandidates: async () => urls.map((url, i) => ({ url, title: `Post ${i}`, suggestedType: 'job' })),
  };
  const pages: Record<string, string> = {};
  const extracts: Record<string, any> = {};
  const calls = { scrape: 0, ai: 0 };
  let aiError: Error | undefined;
  const scraper: any = {
    scrapeUrl: async (url: string) => { calls.scrape++; return { type: 'html', content: pages[url] ?? `page ${url}` }; },
    extractWithAI: async (url: string) => { calls.ai++; if (aiError) throw aiError; return extracts[url] ?? goodExtract({ sourceUrl: url, title: `${goodExtract().title} ${url.slice(-3)}` }); },
  };
  const jobs: any[] = [];
  const jobsService: any = {
    create: jest.fn(async (dto: any, actor: any) => { const j = { _id: `j${jobs.length + 1}`, ...dto, lastEditorId: actor.id, canPublishUsed: actor.canPublish }; jobs.push(j); return j; }),
    update: jest.fn(async (id: string, dto: any, actor: any) => { const j = jobs.find((x) => x._id === id)!; Object.assign(j, dto, { lastEditorId: actor.id }); return j; }),
    findOne: async (id: string) => { const j = jobs.find((x) => x._id === id); if (!j) throw new Error('nf'); return j; },
    hasDuplicate: async (title: string) => jobs.some((j) => j.title.toLowerCase() === title.toLowerCase()),
  };
  const svc = new CrawlerService(
    sourceModel,
    { getAdapter: (k: string) => (k === 'agg' ? adapter : undefined), getAllAdapters: () => [adapter] } as any,
    scraper, jobsService,
    { get: (k: string) => ({ CRAWLER_DELAY_MS: '0', ...config })[k] } as any,
  );
  jest.spyOn(svc, 'probeLink').mockResolvedValue(true);
  return { svc, sources, jobs, jobsService, pages, extracts, calls, setAiError: (e?: Error) => { aiError = e; } };
}

describe('CrawlerService: unattended operation', () => {
  it('publishes automatically when the gate passes and auto-publish is on', async () => {
    const h = harness({ CRAWLER_AUTO_PUBLISH: 'true' });
    const r = await h.svc.runCrawlForAdapter('agg');
    expect(r).toMatchObject({ processed: 1, autoPublished: 1, heldForReview: 0, failed: 0 });
    expect(h.jobs[0].status).toBe('published');
    expect(h.jobs[0].canPublishUsed).toBe(true);
    expect(h.sources[0]).toMatchObject({ status: ScrapedSourceStatus.PUBLISHED, autoPublished: true });
    expect(h.sources[0].gate.passed).toBe(true);
  });

  it('sends everything to review when auto-publish is off (the safe default)', async () => {
    const h = harness({});
    const r = await h.svc.runCrawlForAdapter('agg');
    expect(r).toMatchObject({ processed: 1, autoPublished: 0, heldForReview: 1 });
    expect(h.jobs[0].status).toBe('review');
    expect(h.jobs[0].canPublishUsed).toBe(false);
  });

  it('holds a post that fails the gate, and records why', async () => {
    const h = harness({ CRAWLER_AUTO_PUBLISH: 'true' });
    h.extracts['https://agg.example/post-1'] = goodExtract({ confidence: 40, uncertainFields: ['lastDate'] });
    await h.svc.runCrawlForAdapter('agg');
    expect(h.jobs[0].status).toBe('review');
    expect(h.sources[0].gate.passed).toBe(false);
    expect(h.sources[0].gate.reasons.join(' ')).toMatch(/low model confidence/);
    expect(h.sources[0].gate.reasons.join(' ')).toMatch(/unsure about: lastDate/);
  });

  it('holds a post whose "official" link points back at the source site', async () => {
    const h = harness({ CRAWLER_AUTO_PUBLISH: 'true' });
    h.extracts['https://agg.example/post-1'] = goodExtract({ applyLink: 'https://www.agg.example/other-page' });
    await h.svc.runCrawlForAdapter('agg');
    expect(h.jobs[0].status).toBe('review');
    expect(h.sources[0].gate.reasons).toContain('official link points back at the source site');
  });

  it('holds a post when the official link is dead', async () => {
    const h = harness({ CRAWLER_AUTO_PUBLISH: 'true' });
    (h.svc.probeLink as jest.Mock).mockResolvedValue(false);
    await h.svc.runCrawlForAdapter('agg');
    expect(h.jobs[0].status).toBe('review');
    expect(h.sources[0].gate.reasons).toContain('official link is unreachable');
  });

  it('holds a duplicate of an existing post', async () => {
    const h = harness({ CRAWLER_AUTO_PUBLISH: 'true' });
    h.jobs.push({ _id: 'x', title: goodExtract().title + ' t-1' }); // exactly the title the fake AI produces for ".../post-1"
    await h.svc.runCrawlForAdapter('agg');
    expect(h.sources[0].gate.reasons).toContain('duplicate of an existing post');
    expect(h.jobs[h.jobs.length - 1].status).toBe('review');
  });

  it('does not touch the AI when the page has not changed', async () => {
    const h = harness({ CRAWLER_AUTO_PUBLISH: 'true' });
    await h.svc.runCrawlForAdapter('agg');
    expect(h.calls.ai).toBe(1);
    const r2 = await h.svc.runCrawlForAdapter('agg');
    expect(h.calls.ai).toBe(1);
    expect(r2.unchanged).toBe(1);
    expect(h.jobs).toHaveLength(1);
  });

  it('refreshes an automatic post when the source page changes', async () => {
    const h = harness({ CRAWLER_AUTO_PUBLISH: 'true' });
    await h.svc.runCrawlForAdapter('agg');
    h.pages['https://agg.example/post-1'] = 'the notification was corrected';
    const r2 = await h.svc.runCrawlForAdapter('agg');
    expect(r2.updated).toBe(1);
    expect(h.calls.ai).toBe(2);
    expect(h.jobsService.update).toHaveBeenCalledTimes(1);
    const [id, dto] = h.jobsService.update.mock.calls[0];
    expect(id).toBe('j1');
    expect(dto.revisionNote).toBe('Auto-updated from source');
    expect(dto.slug).toBeUndefined();
    expect(dto.status).toBeUndefined();
    expect(h.jobs).toHaveLength(1);
  });

  it('NEVER overwrites a post a person has edited; flags it instead', async () => {
    const h = harness({ CRAWLER_AUTO_PUBLISH: 'true' });
    await h.svc.runCrawlForAdapter('agg');
    h.jobs[0].lastEditorId = '64b64b64b64b64b64b64b64b'; // a human saved it
    h.pages['https://agg.example/post-1'] = 'changed';
    const r2 = await h.svc.runCrawlForAdapter('agg');
    expect(r2.updated).toBe(0);
    expect(h.jobsService.update).not.toHaveBeenCalled();
    expect(h.sources[0].needsAttention.reason).toMatch(/person has edited/);
    expect(h.sources[0].status).toBe(ScrapedSourceStatus.PUBLISHED);
  });

  it('does not push a worse version live: a changed page that fails the gate is flagged, not applied', async () => {
    const h = harness({ CRAWLER_AUTO_PUBLISH: 'true' });
    await h.svc.runCrawlForAdapter('agg');
    h.pages['https://agg.example/post-1'] = 'changed';
    h.extracts['https://agg.example/post-1'] = goodExtract({ confidence: 20 });
    await h.svc.runCrawlForAdapter('agg');
    expect(h.jobsService.update).not.toHaveBeenCalled();
    expect(h.sources[0].needsAttention.reason).toMatch(/failed checks/);
  });

  it('recreates a post that was deleted by an admin', async () => {
    const h = harness({ CRAWLER_AUTO_PUBLISH: 'true' });
    await h.svc.runCrawlForAdapter('agg');
    h.jobs.length = 0; // admin deleted it
    h.pages['https://agg.example/post-1'] = 'changed';
    await h.svc.runCrawlForAdapter('agg'); // run 2 notices the missing post and resets the source
    await h.svc.runCrawlForAdapter('agg'); // run 3 recreates it
    expect(h.jobs).toHaveLength(1);
  });

  describe('failures and cost control', () => {
    it('counts failed AI calls against the budget and backs off after repeated failures', async () => {
      const h = harness({ CRAWLER_MAX_ATTEMPTS: '3' });
      h.setAiError(new Error('Gemini 500'));
      for (let i = 0; i < 3; i++) await h.svc.runCrawlForAdapter('agg');
      expect(h.calls.ai).toBe(3);
      expect(h.sources[0]).toMatchObject({ status: ScrapedSourceStatus.FAILED, attempts: 3 });
      expect(h.sources[0].nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 20 * 3_600_000);
      const scrapesBefore = h.calls.scrape;
      await h.svc.runCrawlForAdapter('agg'); // inside the back-off window
      expect(h.calls.ai).toBe(3);
      expect(h.calls.scrape).toBe(scrapesBefore); // not even fetched
    });

    it('a recovered source resets its failure counter', async () => {
      const h = harness({ CRAWLER_AUTO_PUBLISH: 'true' });
      h.setAiError(new Error('boom'));
      await h.svc.runCrawlForAdapter('agg');
      expect(h.sources[0].attempts).toBe(1);
      h.setAiError(undefined);
      await h.svc.runCrawlForAdapter('agg');
      expect(h.sources[0]).toMatchObject({ attempts: 0, status: ScrapedSourceStatus.PUBLISHED });
    });

    it('stops at the per-run AI budget; the rest wait for the next run', async () => {
      const urls = ['a1', 'a2', 'a3', 'a4', 'a5'].map((x) => `https://agg.example/${x}`);
      const h = harness({}, { adapterUrls: urls });
      const r = await h.svc.runCrawlForAdapter('agg', 15, 2);
      expect(h.calls.ai).toBe(2);
      expect(r.processed).toBe(2);
      const r2 = await h.svc.runCrawlForAdapter('agg', 15, 2);
      expect(r2.processed).toBe(2);
      expect(h.jobs).toHaveLength(4);
    });

    it('respects the daily auto-publish cap', async () => {
      const urls = ['b1', 'b2', 'b3'].map((x) => `https://agg.example/${x}`);
      const h = harness({ CRAWLER_AUTO_PUBLISH: 'true', CRAWLER_MAX_AUTO_PUBLISH_PER_DAY: '2' }, { adapterUrls: urls });
      const r = await h.svc.runCrawlForAdapter('agg', 15, 10);
      expect(r.autoPublished).toBe(2);
      expect(r.heldForReview).toBe(1);
    });

    it('isolates failures: one broken page does not stop the others', async () => {
      const urls = ['c1', 'c2', 'c3'].map((x) => `https://agg.example/${x}`);
      const h = harness({}, { adapterUrls: urls });
      let n = 0;
      const original = (h.svc as any).scraperService.extractWithAI;
      (h.svc as any).scraperService.extractWithAI = async (...a: any[]) => { if (++n === 2) throw new Error('bad page'); return original(...a); };
      const r = await h.svc.runCrawlForAdapter('agg', 15, 10);
      expect(r).toMatchObject({ processed: 2, failed: 1 });
    });
  });

  it('only one crawl runs at a time', async () => {
    const h = harness({});
    expect(h.svc.startCrawl('agg', 5, 1).started).toBe(true);
    expect(h.svc.startCrawl('agg', 5, 1)).toEqual({ started: false, reason: 'a crawl is already running' });
    await new Promise((r) => setTimeout(r, 50));
  });

  it('rejects an unknown adapter without starting', () => {
    expect(harness({}).svc.startCrawl('nope', 5, 1)).toEqual({ started: false, reason: "unknown adapter 'nope'" });
  });

  it('crawler posts are authored by the bot id', async () => {
    const h = harness({});
    await h.svc.runCrawlForAdapter('agg');
    expect(h.jobs[0].lastEditorId).toBe(CRAWLER_BOT_ID);
  });
});

describe('quality gate rules', () => {
  const ctx = { ownDomains: ['agg.example'], linkReachable: true, duplicate: false };
  const x = (o: any = {}) => goodExtract(o) as any;
  it('passes a complete, confident, well-formed post', () => expect(evaluateGate(x(), ctx)).toEqual({ passed: true, reasons: [] }));
  it.each([
    ['missing confidence', { confidence: undefined }, /no confidence/],
    ['past last date', { lastDate: '2020-01-01' }, /last date is outside/],
    ['last date 5 years away', { lastDate: new Date(Date.now() + 5 * 365 * DAY).toISOString() }, /last date is outside/],
    ['no vacancy count', { totalVacancy: undefined }, /vacancy/],
    ['too few blocks', { sections: [{ type: 'heading', level: 2, text: 'x' }] }, /fewer than 4/],
    ['no table/list/steps', { sections: [{ type: 'heading', level: 2, text: 'a' }, { type: 'paragraph', text: 'b' }, { type: 'paragraph', text: 'c' }, { type: 'paragraph', text: 'd' }] }, /no table/],
    ['AI refusal text', { description: "I'm sorry, I cannot find the details. " + 'x'.repeat(90) }, /placeholder or refusal/],
    ['"undefined" leaked in', { sections: [...goodExtract().sections, { type: 'paragraph', text: 'Fee: undefined' }] }, /placeholder or refusal/],
    ['default organization', { organization: 'Various Organizations' }, /organization is missing/],
    ['no apply link', { applyLink: undefined }, /no official link/],
    ['short meta description', { metaDescription: 'too short' }, /metaDescription/],
    ['invalid important date', { importantDates: [{ label: 'x', date: 'not-a-date' }] }, /important date/],
    ['unknown post type', { type: 'weird' }, /not auto-publishable/],
  ])('fails on %s', (_n, over, re) => {
    const r = evaluateGate(x(over), ctx);
    expect(r.passed).toBe(false);
    expect(r.reasons.join(' | ')).toMatch(re as RegExp);
  });
  it('fails when the title names the source site', () => {
    const r = evaluateGate(x({ title: 'SarkariResult SSC CGL 2026 Recruitment Apply Online' }), { ...ctx, ownDomains: ['sarkariresult.com'] });
    expect(r.passed).toBe(false);
    expect(r.reasons).toContain('mentions the source site by name');
  });
  it('result/admit-card posts do not need a vacancy count or last date', () => {
    expect(evaluateGate(x({ type: 'result', lastDate: undefined, totalVacancy: undefined }), ctx).passed).toBe(true);
  });
});
