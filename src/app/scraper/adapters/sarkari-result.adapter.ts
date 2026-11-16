import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { ISiteAdapter, DiscoveredCandidate } from './site-adapter.interface';
import { safeFetch, decodeBody } from '../../../common/utils/safe-fetch';
import { CRAWLER_USER_AGENT } from '../scraper.service';

@Injectable()
export class SarkariResultAdapter implements ISiteAdapter {
  private readonly logger = new Logger(SarkariResultAdapter.name);

  readonly adapterKey = 'sarkariresult';
  readonly name = 'SarkariResult.com';
  readonly baseUrl = 'https://www.sarkariresult.com';
  readonly ownDomains = ['sarkariresult.com'];

  /**
   * Discovers candidates from SarkariResult homepage and primary sections
   */
  async discoverCandidates(limit = 60): Promise<DiscoveredCandidate[]> {
    this.logger.log(`Starting candidate discovery on ${this.baseUrl}...`);
    try {
      const response = await safeFetch(this.baseUrl, {
        timeoutMs: 20_000,
        headers: {
          'User-Agent': CRAWLER_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
        },
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Failed to fetch ${this.baseUrl}: HTTP ${response.status}`);
      }

      const html = decodeBody(response);
      const $ = cheerio.load(html);
      const candidatesMap = new Map<string, DiscoveredCandidate>();

      // Target relevant hyperlinks
      $('a').each((_, el) => {
        let href = $(el).attr('href')?.trim();
        const text = $(el).text().replace(/\s+/g, ' ').trim();

        if (!href || !text || text.length < 5) return;

        // Standardize URL
        if (href.startsWith('/')) {
          href = `${this.baseUrl}${href}`;
        }

        // Clean query strings/hashes like #google_vignette
        const cleanUrl = href.split('#')[0];

        // Filter: Must be an article / post link on sarkariresult (e.g. /202X/)
        let host = '';
        try { host = new URL(cleanUrl).hostname.toLowerCase(); } catch { return; }
        const onSite = host === 'sarkariresult.com' || host.endsWith('.sarkariresult.com');
        const isPostUrl =
          onSite &&
          (cleanUrl.includes('sarkariresult.com/202') ||
            /\/(latestjob|admitcard|result|admission|syllabus)\/[a-z0-9-]+/i.test(cleanUrl));

        // Skip homepage, category archives, external social links
        const isExcluded =
          cleanUrl === 'https://www.sarkariresult.com/' ||
          cleanUrl === 'https://www.sarkariresult.com' ||
          cleanUrl.endsWith('/latestjob/') ||
          cleanUrl.endsWith('/admitcard/') ||
          cleanUrl.endsWith('/result/') ||
          cleanUrl.endsWith('/admission/') ||
          cleanUrl.endsWith('/syllabus/') ||
          cleanUrl.endsWith('/about-us/') ||
          cleanUrl.endsWith('/contactus/') ||
          cleanUrl.includes('twitter.com') ||
          cleanUrl.includes('facebook.com') ||
          cleanUrl.includes('instagram.com') ||
          cleanUrl.includes('telegram.me') ||
          cleanUrl.includes('t.me');

        if (isPostUrl && !isExcluded) {
          const suggestedType = this.inferTypeFromTextAndUrl(text, cleanUrl);
          
          if (!candidatesMap.has(cleanUrl)) {
            candidatesMap.set(cleanUrl, {
              url: cleanUrl,
              title: text,
              suggestedType,
              metadata: {
                discoveredFrom: 'homepage',
              },
            });
          }
        }
      });

      const candidates = Array.from(candidatesMap.values()).slice(0, limit);
      this.logger.log(`Discovered ${candidates.length} unique candidates from SarkariResult`);
      return candidates;
    } catch (err: any) {
      this.logger.error(`Error discovering candidates from SarkariResult: ${err.message}`, err.stack);
      return [];
    }
  }

  /**
   * Helper to determine post type from title and URL patterns
   */
  private inferTypeFromTextAndUrl(text: string, url: string): string {
    const lowerText = text.toLowerCase();
    const lowerUrl = url.toLowerCase();

    if (lowerText.includes('admit card') || lowerUrl.includes('admit-card') || lowerUrl.includes('hallticket')) {
      return 'admit-card';
    }
    if (lowerText.includes('result') || lowerText.includes('marks') || lowerUrl.includes('result')) {
      return 'result';
    }
    if (lowerText.includes('answer key') || lowerUrl.includes('answer-key') || lowerUrl.includes('answerkey')) {
      return 'answer-key';
    }
    if (lowerText.includes('syllabus') || lowerUrl.includes('syllabus')) {
      return 'syllabus';
    }
    if (lowerText.includes('admission') || lowerUrl.includes('admission') || lowerText.includes('entrance')) {
      return 'admission';
    }
    if (lowerText.includes('online form') || lowerText.includes('recruitment') || lowerText.includes('vacancy') || lowerText.includes('apply')) {
      return 'job';
    }

    return 'job';
  }
}

