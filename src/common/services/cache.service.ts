import { Injectable } from '@nestjs/common';

interface Entry {
  value: unknown;
  expires: number;
}

/**
 * Tiny in-process TTL cache for hot, read-mostly queries (homepage, categories).
 * Swap for Redis when running more than one API instance.
 */
@Injectable()
export class CacheService {
  private store = new Map<string, Entry>();
  private inflight = new Map<string, Promise<unknown>>();

  async wrap<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const hit = this.store.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as T;

    // de-duplicate concurrent loads (cache stampede protection)
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;

    const p = loader()
      .then((value) => {
        this.store.set(key, { value, expires: Date.now() + ttlMs });
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  invalidate(prefix = ''): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}
