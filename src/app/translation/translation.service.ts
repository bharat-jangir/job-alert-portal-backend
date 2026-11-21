import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PostTranslation, PostTranslationSchema, TranslatedLang } from '../jobs/i18n/languages';
import {
  batchStrings, extractTranslatable, reconcile, translationAcceptable, Reconciled,
} from '../jobs/i18n/translate-content';

const LANGUAGE_NAMES: Record<TranslatedLang, string> = { hi: 'Hindi (Devanagari script)' };

export interface TranslateResult {
  translation: PostTranslation;
  /** Whether the result is good enough to publish without a person reading it. */
  acceptable: boolean;
  stats: { strings: number; reverted: number; translatedRatio: number };
}

/** The post fields that get translated. Everything else (dates, links, slug, type) stays shared. */
const POST_TEXT_FIELDS = [
  'title', 'description', 'metaTitle', 'metaDescription', 'eligibility', 'updateNote',
  'organization', 'location', 'salary', 'totalVacancy', 'ageLimit',
] as const;

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private client: GoogleGenerativeAI | null = null;

  constructor(private readonly config: ConfigService) {}

  private apiKey(): string | undefined {
    const key =
      this.config.get<string>('GEMINI_API_KEY') || this.config.get<string>('GOOGLE_API_KEY') ||
      process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    return key && !/^your-(google|gemini)-api-key$/.test(key) ? key : undefined;
  }

  /** True when a Gemini key is configured. */
  get available(): boolean {
    return !!this.apiKey();
  }

  private model() {
    const key = this.apiKey();
    if (!key) throw new ServiceUnavailableException('Translation is unavailable: GEMINI_API_KEY is not configured.');
    this.client ??= new GoogleGenerativeAI(key);
    return this.client.getGenerativeModel({
      model: this.config.get<string>('GEMINI_MODEL') || 'gemini-3.8-flash',
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    });
  }

  private prompt(lang: TranslatedLang) {
    return `You are a professional translator for an Indian government jobs, results and admit-card website.
Translate the values of the JSON object you receive into ${LANGUAGE_NAMES[lang]}.

Rules:
- Reply with ONE JSON object that has EXACTLY the same keys; each value is the translation of the input value.
- Keep every number, date, amount, percentage, URL and e-mail address exactly as written, and keep digits as 0-9 (never Devanagari digits).
- Keep HTML tags exactly as they are; translate only the text between them.
- Keep organisation and exam acronyms in Latin letters (SSC, UPSC, RRB, IBPS, NTA, CBT, OBC, SC, ST, EWS, PwBD, GATE).
- Use the words readers actually search for: Admit Card = एडमिट कार्ड, Result = रिजल्ट, Answer Key = आंसर की, Online Form = ऑनलाइन फॉर्म, Syllabus = सिलेबस, Notification = अधिसूचना, Vacancy = रिक्तियां, Apply Online = ऑनलाइन आवेदन करें, Last Date = अंतिम तिथि, Eligibility = पात्रता.
- Keep personal names and place names in their usual Hindi spelling.
- Plain, simple Hindi that a candidate with a basic education reads easily. Do not add or remove information.`;
  }

  /** Translates a flat list of strings. Output is index-aligned with the input; failures are left undefined. */
  async translateStrings(strings: string[], lang: TranslatedLang = 'hi'): Promise<(string | undefined)[]> {
    const out: (string | undefined)[] = new Array(strings.length).fill(undefined);
    const model = this.model();
    for (const batch of batchStrings(strings)) {
      const payload = Object.fromEntries(batch.map((i) => [String(i), strings[i]]));
      let parsed: Record<string, unknown> | null = null;
      for (let attempt = 0; attempt < 3 && !parsed; attempt++) {
        try {
          const res = await model.generateContent([this.prompt(lang), JSON.stringify(payload)]);
          const text = res.response.text().trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
          const json = JSON.parse(text);
          if (json && typeof json === 'object' && !Array.isArray(json)) parsed = json;
        } catch (e: any) {
          this.logger.warn(`Translation batch attempt ${attempt + 1} failed: ${e?.message}`);
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
      if (!parsed) throw new ServiceUnavailableException('The translation service did not return a usable answer. Try again.');
      for (const i of batch) if (typeof parsed[String(i)] === 'string') out[i] = parsed[String(i)] as string;
    }
    return out;
  }

  /**
   * Translates the text of a post (a plain object with the English fields) and returns a validated
   * `PostTranslation` marked `machine`. Structure, links and numbers are never touched by the model.
   */
  async translatePost(post: Record<string, any>, lang: TranslatedLang = 'hi'): Promise<TranslateResult> {
    if (!post?.title) throw new BadRequestException('The post has no title to translate.');
    const source: Record<string, any> = {};
    for (const f of POST_TEXT_FIELDS) if (typeof post[f] === 'string' && post[f].trim()) source[f] = post[f];
    if (Array.isArray(post.importantDates) && post.importantDates.some((d: any) => d?.label)) {
      source.importantDateLabels = post.importantDates.map((d: any) => d?.label ?? '');
    }
    if (Array.isArray(post.sections) && post.sections.length) source.sections = post.sections;

    const { strings, rebuild } = extractTranslatable(source);
    if (!strings.length) throw new BadRequestException('There is no translatable text in this post.');

    const returned = await this.translateStrings(strings, lang);
    const reconciled: Reconciled = reconcile(strings, returned);
    const rebuilt = rebuild(reconciled.result);

    const parsed = PostTranslationSchema.safeParse({ ...rebuilt, status: 'machine', translatedAt: new Date() });
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      throw new BadRequestException(`The translation did not fit the post format (${i.path.join('.')}: ${i.message}).`);
    }
    return {
      translation: parsed.data,
      acceptable: translationAcceptable(strings.length, reconciled),
      stats: { strings: strings.length, reverted: reconciled.reverted, translatedRatio: Number(reconciled.translatedRatio.toFixed(2)) },
    };
  }
}
