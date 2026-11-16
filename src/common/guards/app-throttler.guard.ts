import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';

/**
 * Per-IP rate limiting, with one exception: your own website server.
 *
 * Server-side rendering makes every page view call this API from ONE IP address (the web server), so
 * a normal amount of traffic would exhaust the per-IP limit and visitors would see broken or empty pages.
 * The web server therefore sends `x-internal-key: <INTERNAL_API_KEY>` and its READ requests skip the limit.
 *
 * Deliberately narrow: only GET/HEAD (logins and every write stay limited even with the key), and only when
 * INTERNAL_API_KEY is set (>= 16 chars). Browsers never see the key, so they stay rate limited.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const key = process.env.INTERNAL_API_KEY;
    if (!key || key.length < 16) return false;

    const req = context.switchToHttp().getRequest();
    if (req?.method !== 'GET' && req?.method !== 'HEAD') return false;

    const given = req.headers?.['x-internal-key'];
    if (typeof given !== 'string') return false;
    const a = Buffer.from(given);
    const b = Buffer.from(key);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
