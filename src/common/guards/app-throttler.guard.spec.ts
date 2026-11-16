import { AppThrottlerGuard } from './app-throttler.guard';

// shouldSkip only reads the request, so the guard can be exercised without the Nest container
const guard = Object.create(AppThrottlerGuard.prototype) as any;
const ctx = (method: string, headers: Record<string, any> = {}) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ method, headers }) }) }) as any;
const KEY = 'a-long-random-internal-key-123';

describe('AppThrottlerGuard.shouldSkip', () => {
  const saved = process.env.INTERNAL_API_KEY;
  afterEach(() => { saved === undefined ? delete process.env.INTERNAL_API_KEY : (process.env.INTERNAL_API_KEY = saved); });

  it('skips the limit for GET with the right key', async () => {
    process.env.INTERNAL_API_KEY = KEY;
    expect(await guard.shouldSkip(ctx('GET', { 'x-internal-key': KEY }))).toBe(true);
    expect(await guard.shouldSkip(ctx('HEAD', { 'x-internal-key': KEY }))).toBe(true);
  });
  it('never skips writes, even with the right key (login brute-force protection stays on)', async () => {
    process.env.INTERNAL_API_KEY = KEY;
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) expect(await guard.shouldSkip(ctx(m, { 'x-internal-key': KEY }))).toBe(false);
  });
  it('does not skip with a wrong, missing or differently-sized key', async () => {
    process.env.INTERNAL_API_KEY = KEY;
    expect(await guard.shouldSkip(ctx('GET', { 'x-internal-key': 'wrong-key-wrong-key-wrong' }))).toBe(false);
    expect(await guard.shouldSkip(ctx('GET', { 'x-internal-key': KEY + 'x' }))).toBe(false);
    expect(await guard.shouldSkip(ctx('GET', { 'x-internal-key': '' }))).toBe(false);
    expect(await guard.shouldSkip(ctx('GET', {}))).toBe(false);
    expect(await guard.shouldSkip(ctx('GET', { 'x-internal-key': ['a', 'b'] }))).toBe(false);
  });
  it('is off when INTERNAL_API_KEY is unset or too short', async () => {
    delete process.env.INTERNAL_API_KEY;
    expect(await guard.shouldSkip(ctx('GET', { 'x-internal-key': 'anything' }))).toBe(false);
    process.env.INTERNAL_API_KEY = 'short';
    expect(await guard.shouldSkip(ctx('GET', { 'x-internal-key': 'short' }))).toBe(false);
  });
});
