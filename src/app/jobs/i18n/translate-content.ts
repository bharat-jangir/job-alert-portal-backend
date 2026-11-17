/**
 * Pure helpers for machine translation of a post.
 *
 * The idea: never let the AI rewrite the post structure. We pull every human-readable string out of the
 * post (title, table cells, list items, FAQ answers, ...), translate that flat list, and put the results
 * back at the same positions. The block types, table shapes, links, styles and ordering are untouched,
 * so a bad translation can make a sentence worse but can never break a table or a link.
 *
 * Each translated string is then checked against its source: numbers, URLs/e-mails and HTML tags must
 * survive unchanged. A string that fails the check keeps its English text instead of shipping a wrong
 * date, fee or link.
 */

/** Keys whose string (or array-of-strings / table) values are shown to readers. */
const TEXT_KEYS = new Set([
  'text', 'title', 'label', 'value', 'question', 'answer', 'caption', 'cite', 'alt', 'content', 'date',
  'headers', 'items', 'rows',
  // top-level post fields (see buildTranslatable)
  'description', 'metaTitle', 'metaDescription', 'eligibility', 'updateNote', 'organization', 'location',
  'salary', 'totalVacancy', 'ageLimit', 'importantDateLabels',
]);

/** Keys that are never text, even if they hold strings (and whole subtrees we leave in English). */
const SKIP_KEYS = new Set(['styles', 'html', 'code', 'url', 'src', 'type', 'tone', 'style', 'align', 'language', 'fileType', 'size', 'slot']);

const DEVANAGARI = /[ऀ-ॿ]/;
const LATIN_LETTER = /[A-Za-z]/g;

export const hasDevanagari = (s: string) => DEVANAGARI.test(s);
const latinLetters = (s: string) => (s.match(LATIN_LETTER) ?? []).length;

/** Worth sending to the translator: has real letters and is not just a URL or e-mail address. */
export function isTranslatable(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || latinLetters(t) === 0) return false;
  if (/^https?:\/\/\S+$/i.test(t)) return false;
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(t)) return false;
  return true;
}

export interface Extraction {
  /** Unique source strings, in first-seen order. */
  strings: string[];
  /** Rebuilds a deep copy of the input with `translated[i]` in place of `strings[i]`. */
  rebuild: (translated: string[]) => any;
}

/** Collects the translatable strings of any JSON value (a post's sections, or a wrapper object). */
export function extractTranslatable(input: unknown): Extraction {
  const index = new Map<string, number>();
  const strings: string[] = [];

  const visit = (node: any, textual: boolean, write: boolean, map?: string[]): any => {
    if (typeof node === 'string') {
      if (!textual || !isTranslatable(node)) return node;
      if (write) return map![index.get(node)!] ?? node;
      if (!index.has(node)) { index.set(node, strings.length); strings.push(node); }
      return node;
    }
    if (Array.isArray(node)) return node.map((n) => visit(n, textual, write, map));
    if (node && typeof node === 'object') {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(node)) {
        out[k] = SKIP_KEYS.has(k) ? v : visit(v, TEXT_KEYS.has(k), write, map);
      }
      return out;
    }
    return node;
  };

  visit(input, false, false);
  return { strings, rebuild: (translated) => visit(input, false, true, translated) };
}

const DEVANAGARI_DIGITS = '०१२३४५६७८९';
/** Hindi text sometimes comes back with Devanagari digits; the site keeps Western digits everywhere. */
export const toAsciiDigits = (s: string) => s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));

const numbers = (s: string) => (toAsciiDigits(s).match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, '')).sort();
const tags = (s: string) => (s.match(/<[^>]*>/g) ?? []).join('');
const links = (s: string) => (s.match(/https?:\/\/[^\s<>"')]+|[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).sort();
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * True when `out` is a faithful rendering of `src`: same numbers, same URLs/e-mails, same HTML tags.
 * (Wording is the translator's job; facts are ours to protect.)
 */
export function preservesFacts(src: string, out: string): boolean {
  if (!out.trim()) return false;
  return sameList(numbers(src), numbers(out)) && sameList(links(src), links(out)) && tags(src) === tags(out);
}

export interface Reconciled {
  /** Final text per source string: the translation, or the original where it failed the checks. */
  result: string[];
  /** How many strings had to fall back to English. */
  reverted: number;
  /** Share (0..1) of "sentence-like" strings that really came back in Hindi. */
  translatedRatio: number;
}

/** Sentence-like: long enough that leaving it in English means the translation did not happen. */
const isSentence = (s: string) => latinLetters(s) >= 12 && /\s/.test(s.trim());

export function reconcile(source: string[], returned: (string | undefined)[]): Reconciled {
  let reverted = 0;
  let sentences = 0;
  let translatedSentences = 0;
  const result = source.map((src, i) => {
    const out = toAsciiDigits(String(returned[i] ?? '')).trim();
    const good = out && preservesFacts(src, out);
    if (!good) reverted++;
    const final = good ? out : src;
    if (isSentence(src)) {
      sentences++;
      if (good && hasDevanagari(final)) translatedSentences++;
    }
    return final;
  });
  return { result, reverted, translatedRatio: sentences ? translatedSentences / sentences : 1 };
}

/** Splits strings into batches that fit a model call (by count and by total characters). */
export function batchStrings(strings: string[], maxItems = 120, maxChars = 12_000): number[][] {
  const batches: number[][] = [];
  let cur: number[] = [];
  let chars = 0;
  strings.forEach((s, i) => {
    if (cur.length && (cur.length >= maxItems || chars + s.length > maxChars)) {
      batches.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(i);
    chars += s.length;
  });
  if (cur.length) batches.push(cur);
  return batches;
}

/** Quality bar for publishing a machine translation without review. */
export const MIN_TRANSLATED_RATIO = 0.7;
export const MAX_REVERTED_SHARE = 0.25;
export function translationAcceptable(count: number, r: Reconciled): boolean {
  return count > 0 && r.translatedRatio >= MIN_TRANSLATED_RATIO && r.reverted / count <= MAX_REVERTED_SHARE;
}
