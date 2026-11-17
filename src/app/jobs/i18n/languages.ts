import { z } from 'zod';
import { SectionsSchema } from '../schemas/post-sections.schema';

/**
 * Languages the public site can serve. English is the base (stored on the post itself);
 * every other language lives in `post.translations[lang]`. Adding a language = add its code here
 * and a message file on the frontend.
 */
export const LANGS = ['en', 'hi'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'en';
/** Languages stored under `translations` (everything except the base language). */
export type TranslatedLang = Exclude<Lang, 'en'>;
export const TRANSLATED_LANGS: TranslatedLang[] = ['hi'];

/** Unknown or missing values mean English: the API never errors on a bad `lang`. */
export function normalizeLang(value: unknown): Lang {
  return (LANGS as readonly string[]).includes(value as string) ? (value as Lang) : DEFAULT_LANG;
}

const str = (max: number) => z.string().trim().max(max).optional();

/**
 * One translated version of a post. Every field is optional: whatever is missing falls back to the
 * English value, so a half-finished translation never produces an empty page. Facts that must not
 * drift between languages (dates, links, vacancies as numbers, slug) are NOT stored here.
 */
export const PostTranslationSchema = z.object({
  title: str(300),
  description: str(1000),
  metaTitle: str(160),
  metaDescription: str(400),
  /** HTML (sanitised on write like the English field). */
  eligibility: str(20_000),
  updateNote: str(300),
  organization: str(200),
  location: str(200),
  salary: str(200),
  totalVacancy: str(100),
  ageLimit: str(100),
  /** Labels for `importantDates`, matched by index (the dates themselves stay shared). */
  importantDateLabels: z.array(z.string().trim().max(200)).max(50).optional(),
  /** Same block structure as the English `sections`, with translated text. */
  sections: SectionsSchema.optional(),
  /** `machine`: produced by AI and not yet read by a person. `reviewed`: a person confirmed it. */
  status: z.enum(['machine', 'reviewed']).default('machine'),
  translatedAt: z.coerce.date().optional(),
});
export type PostTranslation = z.infer<typeof PostTranslationSchema>;

export const TranslationsSchema = z.object({ hi: PostTranslationSchema.optional() }).strict();
export type Translations = z.infer<typeof TranslationsSchema>;

/** A translation counts as available when it has at least a title. */
export function hasTranslation(post: { translations?: Record<string, any> | null }, lang: Lang): boolean {
  if (lang === DEFAULT_LANG) return true;
  return !!post.translations?.[lang]?.title;
}

export function availableLanguages(post: { translations?: Record<string, any> | null }): Lang[] {
  return LANGS.filter((l) => hasTranslation(post, l));
}

/** Scalar fields copied over the English value when the translation has one. */
const SCALARS = [
  'title', 'description', 'metaTitle', 'metaDescription', 'eligibility', 'updateNote',
  'organization', 'location', 'salary', 'totalVacancy', 'ageLimit',
] as const;

/** Fields a list card shows: the cheap subset (no sections / eligibility HTML). */
const CARD_SCALARS = ['title', 'description', 'organization', 'location', 'totalVacancy'] as const;

/** Mongo projection that adds just the translated card fields. */
export function cardTranslationSelect(lang: Lang): string {
  if (lang === DEFAULT_LANG) return '';
  return CARD_SCALARS.map((f) => `translations.${lang}.${f}`).join(' ');
}

/** Mongo projection that drops the heavy parts of translations from a list. */
export function listTranslationExclusion(lang: Lang): string {
  return lang === DEFAULT_LANG ? '-translations' : `-translations.${lang}.sections -translations.${lang}.eligibility`;
}

function strip<T extends Record<string, any>>(post: T): Omit<T, 'translations'> {
  const { translations: _t, ...rest } = post;
  return rest;
}

/**
 * Full post for the public detail page: English with the requested translation laid over it.
 * `language` is what the content is actually in (English when no translation exists), so the site
 * can show a "not available in Hindi yet" notice. `availableLanguages` drives hreflang tags.
 */
export function localizePost<T extends Record<string, any>>(post: T, lang: Lang) {
  const available = availableLanguages(post);
  const t = lang !== DEFAULT_LANG && hasTranslation(post, lang) ? post.translations![lang] : null;
  const out: Record<string, any> = { ...strip(post), language: t ? lang : DEFAULT_LANG, availableLanguages: available };
  if (!t) return out as Omit<T, 'translations'> & { language: Lang; availableLanguages: Lang[] };

  for (const f of SCALARS) if (t[f]) out[f] = t[f];
  // Never pair a Hindi page with the English SEO title/description: without translated ones the page
  // falls back to the (translated) title and description instead.
  if (!t.metaTitle) out.metaTitle = undefined;
  if (!t.metaDescription) out.metaDescription = undefined;
  if (t.sections?.length) out.sections = t.sections;
  if (t.importantDateLabels?.length && Array.isArray(post.importantDates)) {
    out.importantDates = post.importantDates.map((d: any, i: number) => ({ ...d, label: t.importantDateLabels[i] || d.label }));
  }
  out.translationStatus = t.status;
  return out as Omit<T, 'translations'> & { language: Lang; availableLanguages: Lang[] };
}

/** Same overlay for list rows, which only carry the card fields. Never fails on rows without translations. */
export function localizeCard<T extends Record<string, any>>(row: T, lang: Lang): Omit<T, 'translations'> {
  if (lang === DEFAULT_LANG) return strip(row);
  const t = row.translations?.[lang];
  const out: Record<string, any> = strip(row);
  if (t) for (const f of CARD_SCALARS) if (t[f]) out[f] = t[f];
  return out as Omit<T, 'translations'>;
}

export const localizeCards = <T extends Record<string, any>>(rows: T[], lang: Lang) =>
  rows.map((r) => localizeCard(r, lang));
