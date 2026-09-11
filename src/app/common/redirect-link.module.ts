import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RedirectLink, RedirectLinkSchema } from '../redirect-links/schema/redirect-link.schema';
import { RedirectLinkController } from '../redirect-links/redirect-link.controller';
import { RedirectLinkService } from '../redirect-links/redirect-link.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: RedirectLink.name, schema: RedirectLinkSchema }])],
  controllers: [RedirectLinkController],
  providers: [RedirectLinkService],
  exports: [RedirectLinkService],
})
export class RedirectLinkModule {} 