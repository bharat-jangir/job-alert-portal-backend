import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TelegramBroadcastPayload {
  title: string;
  slug: string;
  type?: string;
  organization?: string;
  qualification?: string;
  totalVacancy?: string;
  lastDate?: string | Date;
  applyLink?: string;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly configService: ConfigService) {}

  private get isEnabled(): boolean {
    return this.configService.get<string>('TELEGRAM_BOT_ENABLED') === 'true';
  }

  private get botToken(): string {
    return this.configService.get<string>('TELEGRAM_BOT_TOKEN') || '';
  }

  private get channelId(): string {
    return this.configService.get<string>('TELEGRAM_CHANNEL_ID') || '';
  }

  private get publicSiteUrl(): string {
    const raw = this.configService.get<string>('PUBLIC_SITE_URL') || 'http://localhost:3000';
    return raw.replace(/\/$/, '');
  }

  /**
   * Broadcast a newly published job/result/admit card to the configured Telegram channel
   */
  async broadcastJob(job: TelegramBroadcastPayload): Promise<boolean> {
    if (!this.isEnabled) {
      this.logger.debug('Telegram broadcast skipped: TELEGRAM_BOT_ENABLED is false');
      return false;
    }

    if (!this.botToken || !this.channelId || this.botToken === 'your-bot-token-from-botfather') {
      this.logger.warn('Telegram broadcast skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID is not configured properly in .env');
      return false;
    }

    try {
      const postUrl = `${this.publicSiteUrl}/jobs/${job.slug}`;

      // Format emoji header based on post type
      let typeHeader = '📢 *NEW NOTIFICATION*';
      const lowerType = (job.type || '').toLowerCase();
      if (lowerType.includes('job') || lowerType.includes('online-form')) {
        typeHeader = '💼 *NEW VACANCY ANNOUNCED*';
      } else if (lowerType.includes('result')) {
        typeHeader = '🎯 *EXAMINATION RESULT RELEASED*';
      } else if (lowerType.includes('admit')) {
        typeHeader = '🎟️ *ADMIT CARD AVAILABLE*';
      } else if (lowerType.includes('answer')) {
        typeHeader = '📝 *ANSWER KEY PUBLISHED*';
      } else if (lowerType.includes('admission')) {
        typeHeader = '🎓 *ADMISSION ONLINE FORM*';
      }

      // Format formatted date
      let formattedDate = '';
      if (job.lastDate) {
        const d = new Date(job.lastDate);
        if (!isNaN(d.getTime())) {
          formattedDate = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        }
      }

      // Construct HTML message (HTML is much more reliable with URLs and formatting than Telegram Markdown)
      let message = `<b>${typeHeader}</b>\n\n`;
      message += `📌 <b>${this.escapeHtml(job.title)}</b>\n\n`;

      if (job.organization) {
        message += `🏛️ <b>Org:</b> ${this.escapeHtml(job.organization)}\n`;
      }
      if (job.totalVacancy && job.totalVacancy !== 'Not Specified') {
        message += `👥 <b>Total Vacancy:</b> ${this.escapeHtml(job.totalVacancy)}\n`;
      }
      if (job.qualification) {
        message += `🎓 <b>Qualification:</b> ${this.escapeHtml(job.qualification)}\n`;
      }
      if (formattedDate) {
        message += `📅 <b>Last Date:</b> ${formattedDate}\n`;
      }

      message += `\n🌐 <b>Full Details & Apply Links:</b>\n`;
      message += `<a href="${postUrl}">${postUrl}</a>\n\n`;

      const channelHandle = this.channelId.startsWith('@') ? this.channelId.substring(1) : this.channelId;
      message += `🚀 <b>Join for daily alerts:</b> <a href="https://t.me/${channelHandle}">${this.channelId}</a>`;

      const endpoint = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

      const isLocalhost =
        this.publicSiteUrl.includes('localhost') ||
        this.publicSiteUrl.includes('127.0.0.1');

      const bodyPayload: Record<string, any> = {
        chat_id: this.channelId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      };

      // Telegram only permits public HTTP/HTTPS URLs in inline keyboard buttons.
      // If running on localhost or if applyLink is available, handle safely:
      const buttonUrl = !isLocalhost
        ? postUrl
        : (job.applyLink && job.applyLink.startsWith('http') && !job.applyLink.includes('localhost')
            ? job.applyLink
            : null);

      if (buttonUrl) {
        bodyPayload.reply_markup = {
          inline_keyboard: [[{ text: '👉 View Full Details & Apply', url: buttonUrl }]],
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const resJson = await response.json();
      if (!response.ok || !resJson.ok) {
        this.logger.error(`Telegram API error: ${resJson.description || response.statusText}`);
        return false;
      }

      this.logger.log(`Successfully broadcasted post "${job.title}" to Telegram channel ${this.channelId}`);
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to broadcast post to Telegram: ${err.message}`, err.stack);
      return false;
    }
  }

  /**
   * Escape HTML special characters for Telegram HTML mode
   */
  private escapeHtml(text: string): string {
    return (text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Escape Telegram Markdown special characters
   */
  private escapeMarkdown(text: string): string {
    return (text || '').replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }
}

