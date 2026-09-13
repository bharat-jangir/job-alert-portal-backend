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
      if (sanitizedBody['password']) {
        sanitizedBody['password'] = '***';
      }
    }

    res.on('finish', () => {
      const { statusCode } = res;
      const responseTime = Date.now() - startTime;

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
