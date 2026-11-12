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

  // Enable CORS for frontends & local development
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    process.env.FRONTEND_URL,
    process.env.ADMIN_FRONTEND_URL,
  ].filter((url): url is string => Boolean(url));

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods:["PUT","GET","PATCH","DELETE","POST"]
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
