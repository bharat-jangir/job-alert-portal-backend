import { Global, Module } from '@nestjs/common';
import { CacheService } from './services/cache.service';
import { RevalidateService } from './services/revalidate.service';

@Global()
@Module({
  providers: [CacheService, RevalidateService],
  exports: [CacheService, RevalidateService],
})
export class CommonModule {}
