import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScraperService } from './scraper.service';
import { ScraperController } from './scraper.controller';
import { CrawlerService } from './crawler.service';
import { AdapterRegistryService } from './adapters/adapter-registry.service';
import { SarkariResultAdapter } from './adapters/sarkari-result.adapter';
import { ScrapedSource, ScrapedSourceSchema } from './schemas/scraped-source.schema';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    ConfigModule,
    JobsModule,
    MongooseModule.forFeature([{ name: ScrapedSource.name, schema: ScrapedSourceSchema }]),
  ],
  controllers: [ScraperController],
  providers: [
    ScraperService,
    CrawlerService,
    AdapterRegistryService,
    SarkariResultAdapter,
  ],
  exports: [ScraperService, CrawlerService, AdapterRegistryService],
})
export class ScraperModule { }
