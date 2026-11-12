import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { createLogger, format, transports, Logger } from 'winston';

@Injectable({ scope: Scope.TRANSIENT })
export class CustomLogger implements LoggerService {
  private context?: string;
  private logger: Logger;

  constructor() {
    this.logger = createLogger({
      format: format.combine(
        format.timestamp(),
        format.ms(),
        format.errors({ stack: true }),
        format.json(),
      ),
      transports: [
        new transports.Console({
          format: format.combine(
            format.colorize(),
            format.printf(({ context, level, message, timestamp, ...meta }) => {
              delete (meta as any).ms;
              const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
              return `${timestamp} [${context ?? 'App'}] ${level}: ${message}${extra}`;
            }),
          ),
        }),
        new transports.File({
          filename: 'logs/error.log',
          level: 'error',
        }),
        new transports.File({
          filename: 'logs/combined.log',
        }),
      ],
    });
  }

  setContext(context: string) {
    this.context = context;
  }

  /**
   * Nest calls log(message, 'ContextName') with a plain-string context.
   * Accept either a string (context) or an object (extra metadata).
   */
  private meta(extra: unknown[]): Record<string, unknown> {
    let context = this.context;
    let meta: Record<string, unknown> = {};
    for (const e of extra) {
      if (typeof e === 'string') context = e;
      else if (e && typeof e === 'object') meta = { ...meta, ...(e as object) };
    }
    return { context, ...meta };
  }

  log(message: any, ...extra: unknown[]) {
    this.logger.info(this.str(message), this.meta(extra));
  }

  /** Nest signature: error(message, stack?, context?) */
  error(message: any, ...extra: unknown[]) {
    const [first, ...rest] = extra;
    const trace = typeof first === 'string' && rest.length ? first : undefined;
    this.logger.error(this.str(message), {
      ...this.meta(trace ? rest : extra),
      ...(trace ? { trace } : {}),
    });
  }

  warn(message: any, ...extra: unknown[]) {
    this.logger.warn(this.str(message), this.meta(extra));
  }

  debug(message: any, ...extra: unknown[]) {
    this.logger.debug(this.str(message), this.meta(extra));
  }

  verbose(message: any, ...extra: unknown[]) {
    this.logger.verbose(this.str(message), this.meta(extra));
  }

  private str(m: any): string {
    return typeof m === 'string' ? m : JSON.stringify(m);
  }
}
