import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { createLogger, format, transports, Logger } from 'winston';

/**
 * Log files rotate by size so they can never fill the disk:
 *   combined.log  <- newest (LOG_MAX_SIZE_MB each, LOG_MAX_FILES kept: combined1.log, combined2.log, ...)
 *   error.log     <- errors only, rotated the same way (half the size)
 * Defaults: 10 MB x 5 + 5 MB x 5 = at most ~75 MB. Env overrides:
 *   LOG_DIR (default "logs"), LOG_MAX_SIZE_MB, LOG_MAX_FILES, LOG_LEVEL (default "info"),
 *   LOG_TO_FILE=false to log to the console only (hosts like Render/Docker already capture stdout).
 */
const MB = 1024 * 1024;
const envNum = (key: string, fallback: number) => {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

let shared: Logger | undefined;

/** One winston logger (and one set of file handles) for the whole process. */
export function getWinstonLogger(): Logger {
  if (shared) return shared;

  const dir = process.env.LOG_DIR || 'logs';
  const maxsize = Math.round(envNum('LOG_MAX_SIZE_MB', 10) * MB);
  const maxFiles = Math.max(1, Math.round(envNum('LOG_MAX_FILES', 5)));
  const rotation = { maxsize, maxFiles, tailable: true }; // tailable: the base name is always the newest file

  const list: any[] = [
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
  ];
  let fileWarning: string | undefined;
  if (process.env.LOG_TO_FILE !== 'false') {
    try {
      list.push(
        new transports.File({ filename: `${dir}/error.log`, level: 'error', ...rotation, maxsize: Math.round(maxsize / 2) }),
        new transports.File({ filename: `${dir}/combined.log`, ...rotation }),
      );
    } catch (err: any) {
      // e.g. read-only filesystem or a path that is not a directory: keep the API up, log to the console only
      fileWarning = `File logging disabled (${err.message}). Set LOG_DIR to a writable folder or LOG_TO_FILE=false.`;
    }
  }

  shared = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(format.timestamp(), format.ms(), format.errors({ stack: true }), format.json()),
    transports: list,
  });
  // a full disk or a permissions problem must never take the API down
  shared.on('error', (err) => console.error(`[logger] could not write log file: ${err.message}`));
  if (fileWarning) shared.warn(fileWarning, { context: 'Logger' });
  return shared;
}

@Injectable({ scope: Scope.TRANSIENT })
export class CustomLogger implements LoggerService {
  private context?: string;
  private logger: Logger = getWinstonLogger();

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
