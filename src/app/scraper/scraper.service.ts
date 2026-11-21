import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as cheerio from 'cheerio';
import { JobsService, Actor } from '../jobs/jobs.service';
import { CreateJobDto } from '../jobs/dto/create-job.dto';
import { SectionSchema, SectionsSchema, Section, BlockStyles, BlockStylesSchema } from '../jobs/schemas/post-sections.schema';
import { ExperienceLevel, QualificationLevel } from '../jobs/schemas/job.schema';
import { safeFetch, decodeBody, UnsafeUrlError, ResponseTooLargeError } from '../../common/utils/safe-fetch';

/** Override with CRAWLER_USER_AGENT (e.g. add a contact URL for site owners). */
export const CRAWLER_USER_AGENT = process.env.CRAWLER_USER_AGENT || 'Mozilla/5.0 (compatible; JobAlertBot/1.0)';

export interface ExtractedJobResult {
  title: string;
  slug?: string;
  type: string;
  shortDescription?: string;
  description?: string;
  organization?: string;
  location?: string;
  states?: string[];
  salary?: string;
  qualification?: QualificationLevel;
  experience?: ExperienceLevel;
  lastDate?: string;
  applyLink?: string;
  eligibility?: string;
  totalVacancy?: string;
  ageLimit?: string;
  importantDates?: { label: string; date: string }[];
  metaTitle?: string;
  metaDescription?: string;
  tags?: string[];
  sourceUrl: string;
  sections: Section[];
  /** Model's self-reported certainty (0-100) that every field is supported by the source. */
  confidence?: number;
  /** Fields the model had to guess or could not find. */
  uncertainFields?: string[];
}

interface ScrapedContent {
  type: 'html' | 'pdf';
  content: string | Buffer;
  title?: string;
  detectedLinks?: { label: string; url: string }[];
}

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private genAI: GoogleGenerativeAI | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly jobsService: JobsService,
  ) {
    const apiKey =
      this.configService.get<string>('GEMINI_API_KEY') ||
      this.configService.get<string>('GOOGLE_API_KEY') ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY;

    if (apiKey && !/^your-(google|gemini)-api-key$/.test(apiKey)) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    } else {
      this.logger.warn(
        'GEMINI_API_KEY or GOOGLE_API_KEY is not configured. AI job extraction will be unavailable until a key is set.',
      );
    }
  }

  /**
   * Fetches content from a URL (supports HTML and PDF) with hyperlink extraction.
   */
  async scrapeUrl(url: string): Promise<ScrapedContent> {
    try {
      this.logger.log(`Fetching source URL: ${url}`);
      // safeFetch: public addresses only (re-checked on every redirect), size + time capped
      const response = await safeFetch(url, {
        timeoutMs: 25_000,
        maxBytes: 12 * 1024 * 1024,
        headers: {
          'User-Agent': CRAWLER_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml,application/pdf;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
        },
      });

      if (response.status < 200 || response.status >= 300) {
        throw new BadRequestException(`Failed to fetch URL. HTTP status: ${response.status}`);
      }

      const contentType = String(response.headers['content-type'] || '');
      const isPdf = contentType.toLowerCase().includes('application/pdf') || response.url.toLowerCase().split('?')[0].endsWith('.pdf');

      if (isPdf) {
        const buffer = response.body;
        this.logger.log(`Fetched PDF document (${(buffer.length / 1024).toFixed(1)} KB)`);
        return { type: 'pdf', content: buffer };
      }

      const html = decodeBody(response);
      const $ = cheerio.load(html);

      // Strip non-content and noisy elements first
      $('script, style, noscript, iframe, svg, nav, footer, header, form, aside, .ads, .sidebar, #header, #footer, .nav, .menu').remove();

      const pageTitle = $('title').text().trim() || $('h1').first().text().trim() || '';

      // Collect external hyperlinks before text extraction to preserve real Apply / PDF links
      const detectedLinks: { label: string; url: string }[] = [];
      const seenUrls = new Set<string>();

      $('a').each((_, el) => {
        const $a = $(el);
        const href = ($a.attr('href') || '').trim();
        const text = $a.text().replace(/\s+/g, ' ').trim();

        if (
          !href ||
          href.startsWith('javascript:') ||
          href.startsWith('#') ||
          href.includes('google_vignette') ||
          text.length < 2
        ) {
          return;
        }

        try {
          const resolved = new URL(href, url).href.split('#')[0];
          const resolvedHost = new URL(resolved).hostname.toLowerCase();
          const thirdPartyAggregators = [
            'sarkariresult.com',
            'rojgarresult.com',
            'freejobalert.com',
            'sarkariexam.com',
          ];

          // Filter out third-party competitor links from detected outbound links
          const isThirdPartyAggregator = thirdPartyAggregators.some(
            (domain) => resolvedHost === domain || resolvedHost.endsWith('.' + domain),
          );

          if (!isThirdPartyAggregator) {
            if (!seenUrls.has(resolved) && (resolved.startsWith('http://') || resolved.startsWith('https://'))) {
              seenUrls.add(resolved);
              detectedLinks.push({ label: text, url: resolved });
            }
            // Replace link tag with readable text + markdown link
            $a.replaceWith(` [${text}](${resolved}) `);
          } else {
            // Strip out competitor link, keeping plain text
            $a.replaceWith(` ${text} `);
          }
        } catch {}
      });

      // Prefer main content container if available
      const mainEl = $('main, article, #content, .content, .post-content, #main, .entry-content').first();
      let rawText = mainEl.length > 0 ? mainEl.text() : $('body').text();

      // Clean up whitespace
      const cleanText = rawText
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      const truncatedText = cleanText.slice(0, 120000);
      this.logger.log(
        `Fetched HTML. Extracted ${truncatedText.length} text chars, ${detectedLinks.length} hyperlinks. Title: "${pageTitle}"`,
      );

      return {
        type: 'html',
        content: truncatedText,
        title: pageTitle,
        detectedLinks: detectedLinks.slice(0, 40),
      };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      if (err instanceof UnsafeUrlError) throw new BadRequestException('That URL is not allowed (private or invalid address).');
      if (err instanceof ResponseTooLargeError) throw new BadRequestException('The page is too large to import.');
      if (/timed out/i.test(err.message)) throw new BadRequestException('Request timed out while connecting to source URL (25s limit)');
      this.logger.error(`Error scraping URL ${url}: ${err.message}`, err.stack);
      // generic message: raw network errors would reveal internal host/port details
      throw new BadRequestException('Failed to fetch the page. Check the URL and try again.');
    }
  }

  /**
   * Invokes Gemini Flash to extract structured Job data and Section Builder blocks.
   */
  async extractWithAI(
    sourceUrl: string,
    scraped: ScrapedContent,
    preferredPostType?: string,
  ): Promise<ExtractedJobResult> {
    const apiKey =
      this.configService.get<string>('GEMINI_API_KEY') ||
      this.configService.get<string>('GOOGLE_API_KEY') ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY;

    if (!apiKey || /^your-(google|gemini)-api-key$/.test(apiKey)) {
      throw new BadRequestException(
        'Gemini API key is not configured. Please add GEMINI_API_KEY in backend/.env.development (or server env).',
      );
    }

    const genAI = this.genAI || new GoogleGenerativeAI(apiKey);
    const modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-3.8-flash';
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const linksContext =
      scraped.detectedLinks && scraped.detectedLinks.length > 0
        ? `\n\nKEY DETECTED HYPERLINKS ON SOURCE PAGE (Use these exact URLs for applyLink and links section blocks instead of repeating sourceUrl):\n` +
          scraped.detectedLinks.map((l) => `- "${l.label}": ${l.url}`).join('\n')
        : '';

    const systemPrompt = `You are an elite Government Job Portal SEO & Content Specialist (SSC, UPSC, Railway, State PSC, NTA, Bank & Defense recruitment).
Your job is to analyze the notification/webpage and generate maximum-accuracy structured content with high-CTR SEO metadata and modern section builder blocks.

CRITICAL COPYRIGHT & ZERO THIRD-PARTY BRANDING POLICY:
- NEVER mention third-party websites or brand names (e.g. "Sarkari Result", "Rojgar Result", "FreeJobAlert") in title, description, tags, headings, or content.
- Write purely about the official recruiting organisation / examination board.
- ALL links must strictly point to OFFICIAL government websites (.gov.in, .nic.in, .ac.in, .org, or official board domains) or direct official notification PDFs.
- NEVER output links pointing to competitor or aggregator domains.

OUTPUT MUST BE STRICT VALID JSON conforming to this schema:
{
  "title": string (Descriptive, engaging title under 150 chars. E.g. "NTA SHRESTHA NETS Admission 2027: Apply Online for Class 9 & 11"),
  "slug": string (Clean, SEO-friendly kebab-case URL slug under 80 chars, numbers and hyphens only. E.g. "nta-shrestha-nets-admission-2027"),
  "type": string (category slug: "job", "online-form", "result", "admit-card", "answer-key", or "syllabus". Default: "${preferredPostType || 'job'}"),
  "organization": string (Official hiring board / authority. E.g. "National Testing Agency (NTA)"),
  "location": string (E.g. "All India", "Uttar Pradesh", "Delhi", etc.),
  "states": string[] (E.g. ["All India"]),
  "salary": string (Pay scale or "Not Applicable" for admissions/entrance exams),
  "qualification": string (Strictly one of: "HIGH_SCHOOL", "BACHELORS", "MASTERS", "PHD", "OTHER"),
  "experience": string (Strictly one of: "ENTRY", "MID", "SENIOR", "EXECUTIVE"),
  "lastDate": string (ISO YYYY-MM-DD format of application deadline),
  "applyLink": string (The REAL external apply portal URL from the detected hyperlinks, NOT an aggregator vignette URL),
  "description": string (Comprehensive 1-2 paragraph summary highlighting who can apply, key dates, and steps),
  "eligibility": string (Clear eligibility summary with educational qualifications and cutoffs),
  "totalVacancy": string (E.g. "12,450 Posts" or "Seats as per Scheme Guidelines"),
  "ageLimit": string (Complete age criteria with reference cutoff date. E.g. "12 - 16 Years for Class 9; 14 - 18 Years for Class 11 as on 31/03/2027"),
  "importantDates": [
    { "label": string, "date": string (YYYY-MM-DD or YYYY-MM-DDTHH:mm) }
  ],
  "metaTitle": string (STRICTLY 50-60 characters. Clean, high CTR format: "{Exam/Job Name} {Year}: Apply Online, Dates"),
  "metaDescription": string (STRICTLY 140-155 characters. Must summarize eligibility, vacancies/seats, application deadline date, and call to action),
  "tags": string[] (8-12 high-intent search tags covering exam name, organization acronym, state/central, qualification level, and keywords like "Govt Jobs", "Apply Online", "Recruitment"),
  "confidence": number (0-100. How sure you are that EVERY field above is stated in the source. Use below 70 if any date, vacancy count or link was guessed),
  "uncertainFields": string[] (names of fields you had to guess or could not find in the source, e.g. ["lastDate","totalVacancy"]; empty array if none),
  "sections": [
    // Array of typed Section Builder blocks:
    // 1. callout: { "type": "callout", "tone": "info" | "warning" | "success", "text": "..." }
    // 2. heading: { "type": "heading", "level": 2 | 3, "text": "..." }
    // 3. paragraph: { "type": "paragraph", "text": "..." }
    // 4. table: { "type": "table", "title": "...", "headers": ["Col 1", "Col 2"], "rows": [["val 1", "val 2"]] }
    // 5. steps: { "type": "steps", "title": "How to Apply", "items": ["Step 1...", "Step 2..."] }
    // 6. keyvalue: { "type": "keyvalue", "title": "Quick Overview", "items": [{ "label": "Key", "value": "Val" }] }
    // 7. links: { "type": "links", "title": "Important Links", "items": [{ "label": "Apply Online", "url": "https://..." }] }
    // 8. faq: { "type": "faq", "title": "Frequently Asked Questions", "items": [{ "question": "...", "answer": "..." }] }
  ]
}

FACTUAL ACCURACY (most important rule):
- Use ONLY facts stated in the source. NEVER invent or estimate dates, vacancy counts, fees, ages or links.
- If a fact is not in the source, leave that field empty/omitted and add its name to "uncertainFields".
- Copy dates and numbers exactly. Do not mention the name of the website you are reading; write about the recruiting organisation only.

STRICT SEO & STRUCTURE GUIDELINES:
1. metaTitle: Must NOT exceed 60 characters. Must NOT be truncated.
2. metaDescription: Must NOT exceed 160 characters. Must contain target dates and criteria.
3. sections Order:
   a) Callout block at top with quick status / announcement.
   b) Heading "Application Fee Details" followed by Table block (Category | Fee).
   c) Heading "Important Dates & Schedule" followed by KeyValue or Table block.
   d) Heading "Vacancy / Admission Details & Eligibility" followed by Table block.
   e) Heading "Age Limit & Criteria" followed by KeyValue or Paragraph block.
   f) Heading "Selection Process" followed by Paragraph or Steps block.
   g) Heading "How to Fill the Online Application Form" followed by Steps block with clear instructions.
   h) Heading "Important Official Links" followed by Links block with:
      - "Apply Online" (real link from detected links)
      - "Download Official Notification" (real PDF link)
      - "Official Website" (real official board link)
   i) Heading "Frequently Asked Questions (FAQs)" followed by FAQ block (3-5 high-value questions for Google FAQ schema).
4. Links: Pick the ACTUAL destination links (e.g. nta.ac.in, official portals) from the DETECTED HYPERLINKS list. Never output placeholder or '#google_vignette' links.`;

    let result;
    try {
      if (scraped.type === 'pdf') {
        this.logger.log('Sending PDF buffer to Gemini Flash...');
        const pdfBase64 = (scraped.content as Buffer).toString('base64');
        const pdfPart = {
          inlineData: {
            data: pdfBase64,
            mimeType: 'application/pdf',
          },
        };
        result = await model.generateContent([
          systemPrompt,
          `Source URL: ${sourceUrl}\nExtract all recruitment details from this attached notification PDF into the required JSON schema.`,
          pdfPart,
        ]);
      } else {
        this.logger.log('Sending extracted HTML text to Gemini Flash...');
        const promptText = `Source URL: ${sourceUrl}\nPage Title: ${scraped.title || 'Unknown'}${linksContext}\n\nWebpage Content:\n${scraped.content}`;
        result = await model.generateContent([systemPrompt, promptText]);
      }
    } catch (err: any) {
      this.logger.error(`Gemini API call failed: ${err.message}`, err.stack);
      throw new InternalServerErrorException(`AI extraction failed: ${err.message}`);
    }

    const responseText = result.response.text();
    let parsed: any;
    try {
      const cleanedJson = responseText
        .trim()
        .replace(/^```json/i, '')
        .replace(/^```/i, '')
        .replace(/```$/i, '')
        .trim();
      parsed = JSON.parse(cleanedJson);
    } catch (err: any) {
      this.logger.error(`Failed to parse Gemini response as JSON: ${responseText.slice(0, 500)}`);
      throw new InternalServerErrorException('AI returned an invalid JSON response. Please try again.');
    }

    // Clean, validate and style the extracted sections
    const validatedSections = this.cleanAndValidateSections(parsed.sections);

    // Normalize Qualification & Experience enums
    const qualification = this.normalizeQualification(parsed.qualification);
    const experience = this.normalizeExperience(parsed.experience);

    // Normalize slug (clean lowercase letters, numbers and hyphens)
    const slug = (parsed.slug || parsed.title || 'job-post')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100);

    // Best action link resolution (adapts to post type: admit-card, result, answer-key, etc.)
    const effectiveType = (preferredPostType || parsed.type || 'job').toLowerCase();
    let finalApplyLink = this.normalizeUrl(parsed.applyLink);
    if (!finalApplyLink || finalApplyLink.includes('google_vignette')) {
      let match;
      if (effectiveType === 'admit-card') {
        match = scraped.detectedLinks?.find((l) => /admit card|hall ticket|call letter/i.test(l.label));
      } else if (effectiveType === 'result') {
        match = scraped.detectedLinks?.find((l) => /result|score card|merit list|marks/i.test(l.label));
      } else if (effectiveType === 'answer-key') {
        match = scraped.detectedLinks?.find((l) => /answer key|ans key|objection/i.test(l.label));
      } else if (effectiveType === 'syllabus') {
        match = scraped.detectedLinks?.find((l) => /syllabus|exam pattern/i.test(l.label));
      }
      if (!match) {
        match = scraped.detectedLinks?.find((l) =>
          /apply|online form|registration|login|download|click here/i.test(l.label),
        );
      }
      finalApplyLink = match?.url || sourceUrl;
    }

    // Clean metaTitle: ensure under 65 chars
    let metaTitle = (parsed.metaTitle || parsed.title || '').trim();
    if (metaTitle.length > 65) {
      metaTitle = metaTitle.slice(0, 62).trim() + '...';
    }

    // Clean metaDescription: ensure under 160 chars
    let metaDescription = (parsed.metaDescription || parsed.description || '').trim();
    if (metaDescription.length > 160) {
      metaDescription = metaDescription.slice(0, 157).trim() + '...';
    }

    return {
      title: String(parsed.title || scraped.title || 'Untitled Notification').slice(0, 300),
      slug,
      type: String(preferredPostType || parsed.type || 'job').toLowerCase(),
      shortDescription: parsed.description ? String(parsed.description).slice(0, 1000) : undefined,
      description: parsed.description ? String(parsed.description).slice(0, 1000) : undefined,
      organization: parsed.organization ? String(parsed.organization).slice(0, 200) : undefined,
      location: parsed.location ? String(parsed.location).slice(0, 200) : 'All India',
      states: Array.isArray(parsed.states) && parsed.states.length > 0 ? parsed.states.map((x: any) => String(x).slice(0, 60)).slice(0, 40) : ['All India'],
      salary: parsed.salary ? String(parsed.salary).slice(0, 200) : undefined,
      qualification,
      experience,
      lastDate: this.normalizeDate(parsed.lastDate),
      applyLink: finalApplyLink,
      eligibility: parsed.eligibility ? String(parsed.eligibility).slice(0, 5000) : undefined,
      totalVacancy: parsed.totalVacancy ? String(parsed.totalVacancy).slice(0, 100) : undefined,
      ageLimit: parsed.ageLimit ? String(parsed.ageLimit).slice(0, 100) : undefined,
      importantDates: Array.isArray(parsed.importantDates)
        ? parsed.importantDates
            .map((d: any) => ({
              label: String(d.label || 'Date').slice(0, 200),
              date: this.normalizeDate(d.date) || '',
            }))
            .filter((d: any) => !!d.date)
        : [],
      metaTitle,
      metaDescription,
      tags: Array.isArray(parsed.tags) ? parsed.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 20) : [],
      sourceUrl,
      sections: validatedSections,
      confidence: typeof parsed.confidence === 'number' && isFinite(parsed.confidence) ? Math.max(0, Math.min(100, Math.round(parsed.confidence))) : undefined,
      uncertainFields: Array.isArray(parsed.uncertainFields) ? parsed.uncertainFields.map((f: any) => String(f).slice(0, 40)).slice(0, 20) : [],
    };
  }

  /**
   * Full pipeline: scrapes URL and extracts structured job data.
   */
  async extractFromUrl(url: string, postType?: string): Promise<ExtractedJobResult> {
    const scraped = await this.scrapeUrl(url);
    return this.extractWithAI(url, scraped, postType);
  }

  /**
   * Full pipeline + saves directly as a DRAFT job.
   */
  async generateDraftJob(url: string, postType?: string, actor?: Actor) {
    const extracted = await this.extractFromUrl(url, postType);

    const createDto: CreateJobDto = {
      title: extracted.title,
      slug: extracted.slug,
      status: 'draft',
      type: extracted.type,
      organization: extracted.organization,
      location: extracted.location,
      states: extracted.states,
      salary: extracted.salary,
      qualification: extracted.qualification,
      experience: extracted.experience,
      lastDate: extracted.lastDate,
      applyLink: extracted.applyLink,
      description: extracted.description,
      eligibility: extracted.eligibility,
      totalVacancy: extracted.totalVacancy,
      ageLimit: extracted.ageLimit,
      importantDates: extracted.importantDates,
      metaTitle: extracted.metaTitle,
      metaDescription: extracted.metaDescription,
      tags: extracted.tags,
      sourceUrl: extracted.sourceUrl,
      sections: extracted.sections,
    };

    const draftJob = await this.jobsService.create(createDto, actor);
    return {
      message: 'Draft job created successfully from source URL',
      job: draftJob,
      extracted,
    };
  }

  /**
   * Applies consistent, attractive styling to Section Builder blocks.
   */
  private enrichBlockStyles(type: string, existingStyles?: BlockStyles, level?: number): BlockStyles | undefined {
    // Model output is untrusted (a scraped page can steer it): drop className/customCss entirely and
    // keep the remaining style fields only if they pass the strict allowlist schema.
    const { className: _c, customCss: _css, ...modelStyles } = (existingStyles || {}) as Record<string, any>;
    const checked = BlockStylesSchema.safeParse(modelStyles);
    const merged: BlockStyles = { ...((checked.success ? checked.data : undefined) || {}) };

    switch (type) {
      case 'heading':
        if (level === 2) {
          if (!merged.textColor) merged.textColor = '#1e3a8a';
          if (!merged.fontWeight) merged.fontWeight = 'bold';
          if (!merged.fontSize) merged.fontSize = '1.25rem';
          if (!merged.margin) merged.margin = '20px 0 10px 0';
        } else if (level === 3) {
          if (!merged.textColor) merged.textColor = '#0f172a';
          if (!merged.fontWeight) merged.fontWeight = '600';
          if (!merged.fontSize) merged.fontSize = '1.1rem';
          if (!merged.margin) merged.margin = '16px 0 8px 0';
        }
        break;

      case 'callout':
        if (!merged.padding) merged.padding = '14px 18px';
        if (!merged.borderRadius) merged.borderRadius = '10px';
        if (!merged.margin) merged.margin = '10px 0 18px 0';
        break;

      case 'table':
        if (!merged.borderRadius) merged.borderRadius = '8px';
        if (!merged.borderColor) merged.borderColor = '#e2e8f0';
        if (!merged.borderWidth) merged.borderWidth = '1px';
        if (!merged.borderStyle) merged.borderStyle = 'solid';
        if (!merged.margin) merged.margin = '10px 0 20px 0';
        break;

      case 'steps':
        if (!merged.bgColor) merged.bgColor = '#f8fafc';
        if (!merged.padding) merged.padding = '16px';
        if (!merged.borderRadius) merged.borderRadius = '10px';
        if (!merged.borderColor) merged.borderColor = '#e2e8f0';
        if (!merged.borderWidth) merged.borderWidth = '1px';
        if (!merged.borderStyle) merged.borderStyle = 'solid';
        if (!merged.margin) merged.margin = '12px 0 22px 0';
        break;

      case 'links':
        if (!merged.bgColor) merged.bgColor = '#f0fdf4';
        if (!merged.borderColor) merged.borderColor = '#bbf7d0';
        if (!merged.borderWidth) merged.borderWidth = '1px';
        if (!merged.borderStyle) merged.borderStyle = 'solid';
        if (!merged.borderRadius) merged.borderRadius = '10px';
        if (!merged.padding) merged.padding = '16px';
        if (!merged.margin) merged.margin = '14px 0 22px 0';
        break;

      case 'keyvalue':
        if (!merged.bgColor) merged.bgColor = '#f8fafc';
        if (!merged.padding) merged.padding = '14px';
        if (!merged.borderRadius) merged.borderRadius = '8px';
        if (!merged.borderColor) merged.borderColor = '#e2e8f0';
        if (!merged.borderWidth) merged.borderWidth = '1px';
        if (!merged.borderStyle) merged.borderStyle = 'solid';
        if (!merged.margin) merged.margin = '10px 0 20px 0';
        break;

      case 'faq':
        if (!merged.margin) merged.margin = '14px 0 22px 0';
        break;
    }

    // Clean empty values
    for (const k of Object.keys(merged) as (keyof BlockStyles)[]) {
      if (merged[k] === undefined || merged[k] === '') {
        delete merged[k];
      }
    }

    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  /**
   * Helper: validates, styles and cleans section builder blocks against SectionSchema.
   */
  private cleanAndValidateSections(rawSections: any): Section[] {
    if (!Array.isArray(rawSections)) return [];

    const validSections: Section[] = [];

    for (const sec of rawSections) {
      if (!sec || typeof sec !== 'object' || !sec.type) continue;

      // Handle table
      if (sec.type === 'table') {
        const headers = Array.isArray(sec.headers) ? sec.headers.map((h: any) => String(h || '')) : [];
        const rows = Array.isArray(sec.rows)
          ? sec.rows.map((r: any) => (Array.isArray(r) ? r.map((c: any) => String(c ?? '')) : []))
          : [];
        if (headers.length > 0 && rows.length > 0) {
          const styles = this.enrichBlockStyles('table', sec.styles);
          const parsed = SectionSchema.safeParse({
            type: 'table',
            title: sec.title ? String(sec.title).slice(0, 300) : undefined,
            headers: headers.slice(0, 12),
            rows: rows.slice(0, 200).map((r) => r.slice(0, 12)),
            styles,
          });
          if (parsed.success) validSections.push(parsed.data);
        }
        continue;
      }

      // Handle steps
      if (sec.type === 'steps') {
        const items = Array.isArray(sec.items)
          ? sec.items.map((i: any) => String(i || '').trim()).filter(Boolean)
          : [];
        if (items.length > 0) {
          const styles = this.enrichBlockStyles('steps', sec.styles);
          const parsed = SectionSchema.safeParse({
            type: 'steps',
            title: sec.title ? String(sec.title).slice(0, 300) : undefined,
            items: items.slice(0, 50),
            styles,
          });
          if (parsed.success) validSections.push(parsed.data);
        }
        continue;
      }

      // Handle links
      if (sec.type === 'links') {
        const items = Array.isArray(sec.items)
          ? sec.items
              .filter((i: any) => i && i.label && i.url)
              .map((i: any) => ({ label: String(i.label).slice(0, 300), url: this.normalizeUrl(i.url) }))
              .filter((i: any) => !!i.url) // drop unusable links rather than inventing one
          : [];
        if (items.length > 0) {
          const styles = this.enrichBlockStyles('links', sec.styles);
          const parsed = SectionSchema.safeParse({
            type: 'links',
            title: sec.title ? String(sec.title).slice(0, 300) : undefined,
            items: items.slice(0, 50),
            styles,
          });
          if (parsed.success) validSections.push(parsed.data);
        }
        continue;
      }

      // Handle faq
      if (sec.type === 'faq') {
        const items = Array.isArray(sec.items)
          ? sec.items
              .filter((i: any) => i && i.question && i.answer)
              .map((i: any) => ({
                question: String(i.question).slice(0, 300),
                answer: String(i.answer).slice(0, 5000),
              }))
          : [];
        if (items.length > 0) {
          const styles = this.enrichBlockStyles('faq', sec.styles);
          const parsed = SectionSchema.safeParse({
            type: 'faq',
            title: sec.title ? String(sec.title).slice(0, 300) : undefined,
            items: items.slice(0, 50),
            styles,
          });
          if (parsed.success) validSections.push(parsed.data);
        }
        continue;
      }

      // Handle keyvalue
      if (sec.type === 'keyvalue') {
        const items = Array.isArray(sec.items)
          ? sec.items
              .filter((i: any) => i && i.label && i.value !== undefined)
              .map((i: any) => ({
                label: String(i.label).slice(0, 300),
                value: String(i.value).slice(0, 2000),
              }))
          : [];
        if (items.length > 0) {
          const styles = this.enrichBlockStyles('keyvalue', sec.styles);
          const parsed = SectionSchema.safeParse({
            type: 'keyvalue',
            title: sec.title ? String(sec.title).slice(0, 300) : undefined,
            items: items.slice(0, 100),
            styles,
          });
          if (parsed.success) validSections.push(parsed.data);
        }
        continue;
      }

      // Handle heading
      if (sec.type === 'heading') {
        const level = sec.level === 2 || sec.level === 3 || sec.level === 4 ? sec.level : 2;
        const styles = this.enrichBlockStyles('heading', sec.styles, level);
        const parsed = SectionSchema.safeParse({
          ...sec,
          level,
          styles,
        });
        if (parsed.success) validSections.push(parsed.data);
        continue;
      }

      // Handle callout
      if (sec.type === 'callout') {
        const styles = this.enrichBlockStyles('callout', sec.styles);
        const parsed = SectionSchema.safeParse({
          ...sec,
          styles,
        });
        if (parsed.success) validSections.push(parsed.data);
        continue;
      }

      // Generic parse for other block types
      const parsed = SectionSchema.safeParse(sec);
      if (parsed.success) {
        validSections.push(parsed.data);
      }
    }

    const finalCheck = SectionsSchema.safeParse(validSections);
    return finalCheck.success ? validSections : [];
  }

  private normalizeUrl(u?: string): string | undefined {
    if (!u) return undefined;
    try {
      const clean = u.trim().split('#')[0];
      const parsed = new URL(clean);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
    } catch {
      return undefined;
    }
  }

  private normalizeDate(d?: string): string | undefined {
    if (!d) return undefined;
    try {
      const parsed = new Date(d);
      if (isNaN(parsed.getTime())) return undefined;
      return parsed.toISOString().split('T')[0]; // YYYY-MM-DD
    } catch {
      return undefined;
    }
  }

  private normalizeQualification(q?: string): QualificationLevel {
    if (!q) return QualificationLevel.OTHER;
    const upper = q.toUpperCase();
    if (upper in QualificationLevel) {
      return QualificationLevel[upper as keyof typeof QualificationLevel];
    }
    if (upper.includes('10') || upper.includes('12') || upper.includes('HIGH') || upper.includes('INTERMEDIATE') || upper.includes('SCHOOL')) {
      return QualificationLevel.HIGH_SCHOOL;
    }
    if (upper.includes('BACHELOR') || upper.includes('GRADUATE') || upper.includes('DEGREE') || upper.includes('B.TECH') || upper.includes('B.SC')) {
      return QualificationLevel.BACHELORS;
    }
    if (upper.includes('MASTER') || upper.includes('POST GRADUATE') || upper.includes('M.TECH') || upper.includes('M.SC') || upper.includes('MBA')) {
      return QualificationLevel.MASTERS;
    }
    if (upper.includes('PHD') || upper.includes('DOCTORATE')) {
      return QualificationLevel.PHD;
    }
    return QualificationLevel.OTHER;
  }

  private normalizeExperience(e?: string): ExperienceLevel {
    if (!e) return ExperienceLevel.ENTRY;
    const upper = e.toUpperCase();
    if (upper in ExperienceLevel) {
      return ExperienceLevel[upper as keyof typeof ExperienceLevel];
    }
    if (upper.includes('MID') || upper.includes('3+') || upper.includes('EXPERIENCED')) {
      return ExperienceLevel.MID;
    }
    if (upper.includes('SENIOR') || upper.includes('5+') || upper.includes('LEAD')) {
      return ExperienceLevel.SENIOR;
    }
    if (upper.includes('EXEC') || upper.includes('DIRECTOR')) {
      return ExperienceLevel.EXECUTIVE;
    }
    return ExperienceLevel.ENTRY;
  }
}
