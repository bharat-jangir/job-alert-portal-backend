import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RequestLogsService } from '../../app/request-logs/request-logs.service';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(private readonly requestLogsService: RequestLogsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, query, body, ip } = req;
    const userAgent = req.get('user-agent') || '';
    const startTime = Date.now();

    // Sanitize body to remove sensitive fields
    let sanitizedBody = {};
    if (body) {
      sanitizedBody = { ...body };
      for (const key of ['password', 'currentPassword', 'newPassword', 'token', 'access_token']) {
        if (sanitizedBody[key]) sanitizedBody[key] = '***';
      }
      // post bodies can be huge (HTML); keep the log small
      if (typeof sanitizedBody['htmlContent'] === 'string') sanitizedBody['htmlContent'] = '[omitted]';
      if (sanitizedBody['sections']) sanitizedBody['sections'] = '[omitted]';
    }

    res.on('finish', () => {
      const { statusCode } = res;
      const responseTime = Date.now() - startTime;
      // Public page reads are high-volume and low-value: only log writes and failures.
      if (method === 'GET' && statusCode < 400) return;

      this.requestLogsService.createLog({
        method,
        url: originalUrl,
        query,
        body: sanitizedBody,
        ip,
        userAgent,
        statusCode,
        responseTime,
      });
    });

    next();
  }
}
