import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RevalidatePayload {
  tags?: string[];
  paths?: string[];
}

/**
 * Tells the public Next.js site which cached pages are stale (on-demand ISR).
 * Fire-and-forget: a failed webhook must never fail an editor's save.
 */
@Injectable()
export class RevalidateService {
  private readonly logger = new Logger(RevalidateService.name);

  constructor(private config: ConfigService) {}

  trigger(payload: RevalidatePayload): void {
    const url = this.config.get<string>('FRONTEND_REVALIDATE_URL');
    const secret = this.config.get<string>('REVALIDATE_SECRET');
    if (!url || !secret) return;

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, ...payload }),
      signal: AbortSignal.timeout(5000),
    })
      .then((res) => {
        if (!res.ok) this.logger.warn(`Revalidate webhook responded ${res.status}`);
      })
      .catch((err) => this.logger.warn(`Revalidate webhook failed: ${err?.message}`));
  }
}
