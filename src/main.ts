import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { ValidationPipe } from '@nestjs/common';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { CustomLogger } from './common/services/logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new CustomLogger(),
  });

  // Enable CORS with specific configuration based on environment
  app.enableCors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000', 'http://localhost:3001'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
    credentials: true,
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
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global prefix
  app.setGlobalPrefix('api');

  await app.listen(process.env.PORT || 5000);
}
bootstrap();
