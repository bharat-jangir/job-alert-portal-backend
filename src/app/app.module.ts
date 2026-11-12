import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { CommonModule } from '../common/common.module';
import { HealthController } from './health/health.controller';
import { AppController } from './app.controller';
import { AppService } from '../app/app.service';
import { JobsModule } from '../app/jobs/jobs.module';
import { AuthModule } from '../app/auth/auth.module';
import { UsersModule } from '../app/users/users.module';
import { RedirectLinkModule } from '../app/common/redirect-link.module';
import { FaqsModule } from '../app/faqs/faqs.module';
import { ContactModule } from '../app/contact/contact.module';
import { OrganizationsModule } from '../app/organizations/organizations.module';
import { JobCategoriesModule } from '../app/job-categories/job-categories.module';
import { RequestLogsModule } from '../app/request-logs/request-logs.module';
import { RequestLoggerMiddleware } from '../common/middleware/request-logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
      validate: (env: Record<string, any>) => {
        const missing = ['MONGODB_URI', 'JWT_SECRET'].filter((k) => !env[k]);
        if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        if (env.NODE_ENV === 'production' && String(env.JWT_SECRET).length < 32) {
          throw new Error('JWT_SECRET must be at least 32 characters in production');
        }
        return env;
      },
    }),
    ScheduleModule.forRoot(),
    // default: 120 requests / minute / IP; sensitive routes tighten this with @Throttle
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 120 }] }),
    CommonModule,
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
        maxPoolSize: 20,
        serverSelectionTimeoutMS: 8000,
      }),
      inject: [ConfigService],
    }),
    JobsModule,
    AuthModule,
    UsersModule,
    RedirectLinkModule,
    FaqsModule,
    ContactModule,
    OrganizationsModule,
    JobCategoriesModule,
    RequestLogsModule,
  ],
  exports: [],
  controllers: [AppController, HealthController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
