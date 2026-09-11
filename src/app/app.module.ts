import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from '../app/app.service';
import { JobsModule } from '../app/jobs/jobs.module';
import { AuthModule } from '../app/auth/auth.module';
import { UsersModule } from '../app/users/users.module';
import { RedirectLinkModule } from '../app/common/redirect-link.module';
import { FaqsModule } from '../app/faqs/faqs.module';
import { ContactModule } from '../app/contact/contact.module';
import { OrganizationsModule } from '../app/organizations/organizations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
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
  ],
  exports: [],
  controllers: [AppController,],
  providers: [AppService],
})
export class AppModule {}
