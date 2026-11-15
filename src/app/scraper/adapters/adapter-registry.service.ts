import { Injectable, Logger } from '@nestjs/common';
import { ISiteAdapter } from './site-adapter.interface';
import { SarkariResultAdapter } from './sarkari-result.adapter';

@Injectable()
export class AdapterRegistryService {
  private readonly logger = new Logger(AdapterRegistryService.name);
  private readonly adapters = new Map<string, ISiteAdapter>();

  constructor(private readonly sarkariResultAdapter: SarkariResultAdapter) {
    this.register(sarkariResultAdapter);
  }

  register(adapter: ISiteAdapter): void {
    this.adapters.set(adapter.adapterKey, adapter);
    this.logger.log(`Registered crawler adapter: [${adapter.adapterKey}] (${adapter.name})`);
  }

  getAdapter(key: string): ISiteAdapter | undefined {
    return this.adapters.get(key);
  }

  getAllAdapters(): ISiteAdapter[] {
    return Array.from(this.adapters.values());
  }
}

