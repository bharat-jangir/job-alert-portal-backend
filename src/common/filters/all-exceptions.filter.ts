import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

/** Maps every error (HTTP, Mongo, unknown) to one consistent JSON shape. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as any;
      message = res?.message ?? exception.message;
      error = res?.error ?? exception.name;
    } else if (exception?.code === 11000) {
      status = HttpStatus.CONFLICT;
      const fields = Object.keys(exception.keyPattern ?? exception.keyValue ?? {}).join(', ');
      message = `Duplicate value${fields ? ` for: ${fields}` : ''}`;
      error = 'Conflict';
    } else if (exception?.name === 'CastError') {
      status = HttpStatus.BAD_REQUEST;
      message = `Invalid value for ${exception.path}`;
      error = 'Bad Request';
    } else if (exception?.name === 'ValidationError' && exception?.errors) {
      status = HttpStatus.BAD_REQUEST;
      message = Object.values(exception.errors).map((e: any) => e.message);
      error = 'Bad Request';
    }

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} → ${status}`, exception?.stack ?? String(exception));
    } else {
      this.logger.warn(`${request.method} ${request.url} → ${status} ${JSON.stringify(message)}`);
    }

    response.status(status).json({
      error: {
        statusCode: status,
        message,
        error,
        path: request.url,
        method: request.method,
        timestamp: new Date().toISOString(),
      },
      meta: { statusCode: status, path: request.url, timestamp: new Date().toISOString() },
    });
  }
}
