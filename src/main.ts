import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { ValidationPipe } from '@nestjs/common';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { CustomLogger } from './common/services/logger.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import helmet from 'helmet';
import * as compression from 'compression';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new CustomLogger(),
  });

  // Behind nginx / Render / a load balancer: TRUST_PROXY=1 so rate limiting sees real client IPs
  const proxies = Number(process.env.TRUST_PROXY ?? 1);
  if (proxies > 0) app.set('trust proxy', proxies);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());

  // Enable CORS for all origins while supporting credentials
  app.enableCors({
    origin: (origin, callback) => {
      // Reflect the request origin to allow credentials from any origin
      callback(null, origin || true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global interceptors
  app.useGlobalInterceptors(new TransformInterceptor());

  // Global filters
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global prefix
  app.setGlobalPrefix('api');
  app.enableShutdownHooks(); // flushes buffered view counters on SIGTERM

  // Listen on process.env.PORT provided by Render, fallback to 5000
  const port = process.env.PORT || 5000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
