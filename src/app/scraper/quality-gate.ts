import type { ExtractedJobResult } from './scraper.service';

/**
 * Decides whether an AI-extracted post is good enough to publish with no human review.
 * Pure function (no I/O) so every rule is unit-tested. Any failed rule keeps the post in "review"
 * with the reasons stored on the source record, so the admin only sees posts that need attention.
 */
export interface GateContext {
  /** Domains of the site we copied from; an "apply" link there is not an official destination. */
  ownDomains: string[];
  /** Result of probing applyLink. undefined = not checked. */
  linkReachable?: boolean;
  /** True when an existing post already has this title or source URL. */
  duplicate?: boolean;
  minConfidence?: number; // default 70
  now?: Date;
}

export interface GateResult {
  passed: boolean;
  reasons: string[];
}

const ACTION_TYPES = ['job', 'online-form', 'admission'];
const LINK_TYPES = [...ACTION_TYPES, 'admit-card', 'result', 'answer-key'];
const CRITICAL_UNCERTAIN = ['lastDate', 'applyLink', 'title', 'totalVacancy', 'organization', 'importantDates'];
const PLACEHOLDER = /\b(undefined|null|nan|lorem ipsum|as an ai|i cannot|i can't|i'm sorry|not (available|specified|mentioned) (in|on) the (source|provided|page|notification)|n\/a)\b/i;
const DEFAULTS = ['various organizations', 'as per rules'];
const DAY = 86_400_000;

const hostOf = (u?: string) => { try { return new URL(u!).hostname.toLowerCase(); } catch { return ''; } };
const isOwn = (u: string | undefined, own: string[]) => {
  const h = hostOf(u);
  return !!h && own.some((d) => h === d || h.endsWith(`.${d}`));
};

function textOfSections(sections: any[]): string {
  const out: string[] = [];
  const walk = (v: any) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (k !== 'styles') walk(x); });
  };
  walk(sections);
  return out.join(' ');
}

export function evaluateGate(x: ExtractedJobResult, ctx: GateContext): GateResult {
  const reasons: string[] = [];
  const now = (ctx.now ?? new Date()).getTime();
  const type = (x.type || '').toLowerCase();
  const fail = (r: string) => reasons.push(r);

  // --- the model's own doubts
  const min = ctx.minConfidence ?? 70;
  if (typeof x.confidence !== 'number') fail('model gave no confidence score');
  else if (x.confidence < min) fail(`low model confidence (${x.confidence} < ${min})`);
  const doubts = (x.uncertainFields ?? []).filter((f) => CRITICAL_UNCERTAIN.includes(f));
  if (doubts.length) fail(`model unsure about: ${doubts.join(', ')}`);

  // --- basic content quality
  const title = (x.title || '').trim();
  if (title.length < 15 || title.length > 200) fail('title length is not 15-200 characters');
  if ((x.description || '').trim().length < 80) fail('description is too short');
  const mt = (x.metaTitle || '').trim();
  if (mt.length < 20 || mt.length > 65) fail('metaTitle is not 20-65 characters');
  const md = (x.metaDescription || '').trim();
  if (md.length < 80 || md.length > 160) fail('metaDescription is not 80-160 characters');
  const org = (x.organization || '').trim();
  if (!org || DEFAULTS.includes(org.toLowerCase())) fail('organization is missing');

  const sections = x.sections ?? [];
  if (sections.length < 4) fail('fewer than 4 content blocks');
  if (!sections.some((s: any) => s.type === 'heading')) fail('no headings');
  if (!sections.some((s: any) => ['table', 'keyvalue', 'steps', 'list'].includes(s.type))) fail('no table, info card, steps or list');

  const allText = [title, x.description, x.metaTitle, x.metaDescription, textOfSections(sections)].join(' ');
  if (PLACEHOLDER.test(allText)) fail('contains placeholder or refusal text');
  // copying the source's branding into our post is both unprofessional and a legal flag
  const brands = ctx.ownDomains.map((d) => d.split('.')[0]).filter((b) => b.length > 3);
  if (brands.some((b) => new RegExp(b, 'i').test([title, x.description, x.metaTitle, x.metaDescription].join(' ')))) {
    fail('mentions the source site by name');
  }

  // --- facts that matter most to visitors
  if (!LINK_TYPES.includes(type)) fail(`post type "${type}" is not auto-publishable`);
  if (LINK_TYPES.includes(type)) {
    if (!x.applyLink) fail('no official link found');
    else if (isOwn(x.applyLink, ctx.ownDomains)) fail('official link points back at the source site');
    else if (ctx.linkReachable === false) fail('official link is unreachable');
  }
  if (ACTION_TYPES.includes(type)) {
    if (!x.lastDate) fail('last date is missing');
    else {
      const t = new Date(x.lastDate).getTime();
      if (isNaN(t) || t < now - 2 * DAY || t > now + 450 * DAY) fail('last date is outside a sensible window');
    }
    if (!x.totalVacancy) fail('vacancy / seats count is missing');
  }
  for (const d of x.importantDates ?? []) {
    const t = new Date(d.date).getTime();
    if (isNaN(t) || Math.abs(t - now) > 3 * 365 * DAY) { fail('an important date is invalid or implausible'); break; }
  }

  if (ctx.duplicate) fail('duplicate of an existing post');

  return { passed: reasons.length === 0, reasons };
}
