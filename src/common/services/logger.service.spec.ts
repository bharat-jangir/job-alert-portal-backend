import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Builds a CustomLogger with the given env. The module registry is reset first because the winston
 * logger is a process-wide singleton that reads its settings once, when first created.
 */
function makeLogger(env: Record<string, string>) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  jest.resetModules();
  const { CustomLogger } = require('./logger.service') as typeof import('./logger.service');
  const logger = new CustomLogger(); // settings are read here, so the env must still be set
  Object.keys(env).forEach((k) => (k in saved ? (process.env[k] = saved[k]) : delete process.env[k]));
  return logger;
}

/**
 * Collects console output wherever winston's Console transport sends it: Node's console stream, console.log
 * (what it falls back to), or process.stdout. Jest replaces `console`, so which one is used varies by run mode.
 */
function captureConsole() {
  const lines: string[] = [];
  const grab = (c: any) => { lines.push(String(c)); return true; };
  const spies: jest.SpyInstance[] = [
    jest.spyOn(console, 'log').mockImplementation(grab as any),
    jest.spyOn(process.stdout, 'write').mockImplementation(grab as any),
  ];
  const stream = (console as any)._stdout;
  if (stream?.write) spies.push(jest.spyOn(stream, 'write').mockImplementation(grab as any));
  return { text: () => lines.join('\n'), restore: () => spies.forEach((sp) => sp.mockRestore()) };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function settle(dir: string) { // winston writes asynchronously: wait until file sizes stop changing
  let last = '';
  for (let i = 0; i < 40; i++) {
    await wait(100);
    const now = fs.readdirSync(dir).map((f) => `${f}:${fs.statSync(path.join(dir, f)).size}`).sort().join(',');
    if (now === last && now) return;
    last = now;
  }
}

describe('log rotation', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logtest-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('caps total log size: old files are rotated and deleted', async () => {
    const log = makeLogger({ LOG_DIR: dir, LOG_MAX_SIZE_MB: '0.02', LOG_MAX_FILES: '3', LOG_TO_FILE: 'true' }); // 20 KB x 3
    const out = captureConsole();
    const line = 'x'.repeat(400);
    for (let i = 0; i < 2000; i++) log.log(`${i} ${line}`, 'Spec'); // ~ 1 MB written
    await settle(dir);
    out.restore();

    const files = fs.readdirSync(dir).filter((f) => f.startsWith('combined'));
    const sizes = files.map((f) => fs.statSync(path.join(dir, f)).size);
    expect(files).toContain('combined.log'); // newest keeps the base name
    expect(files.length).toBeGreaterThan(1); // it really did rotate (1 MB written into 20 KB files)
    expect(files.length).toBeLessThanOrEqual(3); // never more than LOG_MAX_FILES
    expect(Math.max(...sizes)).toBeLessThan(20 * 1024 + 2000); // each file ~ the limit (+ one line)
    expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThan(3 * (20 * 1024 + 2000)); // total bounded, not ~1 MB
  }, 20000);

  it('rotates error.log too, at half the size', async () => {
    const log = makeLogger({ LOG_DIR: dir, LOG_MAX_SIZE_MB: '0.02', LOG_MAX_FILES: '2', LOG_TO_FILE: 'true' });
    const out = captureConsole();
    for (let i = 0; i < 600; i++) log.error(`boom ${i} ${'y'.repeat(300)}`, 'stack', 'Spec');
    await settle(dir);
    out.restore();
    const errs = fs.readdirSync(dir).filter((f) => f.startsWith('error'));
    expect(errs).toContain('error.log');
    expect(errs.length).toBeGreaterThan(1);
    expect(errs.length).toBeLessThanOrEqual(2);
    expect(Math.max(...errs.map((f) => fs.statSync(path.join(dir, f)).size))).toBeLessThan(10 * 1024 + 2000);
  }, 20000);

  it('LOG_TO_FILE=false writes no files at all', async () => {
    const out = captureConsole();
    makeLogger({ LOG_DIR: dir, LOG_TO_FILE: 'false' }).log('console only', 'Spec');
    await wait(300);
    const printed = out.text();
    out.restore();
    expect(printed).toMatch(/console only/); // it did log, to the console
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('does not crash the server when the log directory cannot be created: falls back to the console', async () => {
    const blocker = path.join(dir, 'a-file-not-a-dir');
    fs.writeFileSync(blocker, 'x');
    const out = captureConsole();
    let logger: any;
    expect(() => { logger = makeLogger({ LOG_DIR: path.join(blocker, 'logs'), LOG_TO_FILE: 'true' }); }).not.toThrow();
    expect(() => logger.log('still alive', 'Spec')).not.toThrow();
    await wait(400);
    const printed = out.text();
    out.restore();
    expect(printed).toMatch(/still alive/); // normal logging continues on the console
    expect(printed).toMatch(/File logging disabled/); // and the problem is reported, not hidden
  });
});
