import * as http from 'node:http';
import * as zlib from 'node:zlib';
import { AddressInfo } from 'node:net';
import { isPrivateAddress, safeFetch, UnsafeUrlError, ResponseTooLargeError, decodeBody } from './safe-fetch';

describe('isPrivateAddress', () => {
  const blocked = ['127.0.0.1', '127.1.2.3', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:127.0.0.1', '::ffff:10.1.2.3', 'ff02::1', 'not-an-ip'];
  const allowed = ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8'];
  it.each(blocked)('blocks %s', (ip) => expect(isPrivateAddress(ip)).toBe(true));
  it.each(allowed)('allows %s', (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe('safeFetch URL checks', () => {
  const bad = ['http://127.0.0.1/', 'http://localhost:5000/', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.1/', 'http://[::1]/',
    'http://2130706433/', 'http://0x7f.0.0.1/', 'http://user:pass@example.com/', 'ftp://example.com/', 'file:///etc/passwd', 'javascript:alert(1)',
    'http://service.internal/', 'http://printer.local/', 'not a url'];
  it.each(bad)('rejects %s', async (u) => {
    await expect(safeFetch(u, { timeoutMs: 2000 })).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});

describe('safeFetch behaviour against a local server (fake host mapped to loopback via the test-only lookup)', () => {
  let server: http.Server;
  let port: number;
  const toLoopback = ((_h: string, o: any, cb: any) => (o?.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4))) as any;
  const url = (p: string) => `http://fake-host.test:${port}${p}`;
  beforeAll((done) => {
    server = http.createServer((req, res) => {
      switch (req.url) {
        case '/ok': res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('hello'); break;
        case '/big': res.end(Buffer.alloc(2 * 1024 * 1024, 'a')); break;
        case '/gzip-bomb': res.setHeader('content-encoding', 'gzip'); res.end(zlib.gzipSync(Buffer.alloc(8 * 1024 * 1024, 'b'))); break;
        case '/gzip-ok': res.setHeader('content-encoding', 'gzip'); res.end(zlib.gzipSync(Buffer.from('zipped'))); break;
        case '/redir-ok': res.statusCode = 302; res.setHeader('location', '/ok'); res.end(); break;
        case '/redir-private': res.statusCode = 302; res.setHeader('location', 'http://169.254.169.254/latest/meta-data/'); res.end(); break;
        case '/redir-loop': res.statusCode = 302; res.setHeader('location', '/redir-loop'); res.end(); break;
        case '/slow': setTimeout(() => res.end('late'), 3000); break;
        case '/404': res.statusCode = 404; res.end('nope'); break;
        default: res.end('x');
      }
    }).listen(0, '127.0.0.1', () => { port = (server.address() as AddressInfo).port; done(); });
  });
  afterAll((done) => { server.closeAllConnections?.(); server.close(done); });

  it('with the real (default) lookup, a host that resolves to loopback is refused', async () => {
    await expect(safeFetch(`http://localtest.me:${port}/ok`, { timeoutMs: 4000 })).rejects.toBeDefined();
  });
  it('fetches a normal page and decodes it', async () => {
    const r = await safeFetch(url('/ok'), {}, { lookup: toLoopback });
    expect(r.status).toBe(200);
    expect(decodeBody(r)).toBe('hello');
  });
  it('reports non-2xx statuses instead of throwing', async () => {
    expect((await safeFetch(url('/404'), {}, { lookup: toLoopback })).status).toBe(404);
  });
  it('follows a safe redirect', async () => {
    const r = await safeFetch(url('/redir-ok'), {}, { lookup: toLoopback });
    expect(decodeBody(r)).toBe('hello');
    expect(r.url).toContain('/ok');
  });
  it('REFUSES a redirect that points at a private/metadata address', async () => {
    await expect(safeFetch(url('/redir-private'), {}, { lookup: toLoopback })).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it('stops redirect loops', async () => {
    await expect(safeFetch(url('/redir-loop'), {}, { lookup: toLoopback })).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it('enforces the body size cap', async () => {
    await expect(safeFetch(url('/big'), { maxBytes: 1024 * 1024 }, { lookup: toLoopback })).rejects.toBeInstanceOf(ResponseTooLargeError);
  });
  it('enforces the cap AFTER decompression (gzip bomb)', async () => {
    await expect(safeFetch(url('/gzip-bomb'), { maxBytes: 1024 * 1024 }, { lookup: toLoopback })).rejects.toBeInstanceOf(ResponseTooLargeError);
  });
  it('decompresses small gzip responses', async () => {
    const r = await safeFetch(url('/gzip-ok'), {}, { lookup: toLoopback });
    expect(r.body.toString()).toBe('zipped');
  });
  it('enforces the total timeout', async () => {
    await expect(safeFetch(url('/slow'), { timeoutMs: 500 }, { lookup: toLoopback })).rejects.toThrow(/timed out/i);
  });
  it('HEAD requests return no body', async () => {
    const r = await safeFetch(url('/ok'), { method: 'HEAD' }, { lookup: toLoopback });
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(0);
  });
});

describe('safeFetch size / decode helpers (using the internals through a permissive stub server is avoided on purpose)', () => {
  it('decodeBody honours charset and falls back to utf-8', () => {
    const body = Buffer.from('héllo', 'utf-8');
    expect(decodeBody({ body, headers: { 'content-type': 'text/html; charset=utf-8' } })).toBe('héllo');
    expect(decodeBody({ body, headers: { 'content-type': 'text/html; charset=bogus-charset' } })).toBe('héllo');
    expect(decodeBody({ body: Buffer.from([0xe9]), headers: { 'content-type': 'text/html; charset=iso-8859-1' } })).toBe('é');
  });
  it('exports the size error type', () => { expect(new ResponseTooLargeError('x')).toBeInstanceOf(Error); });
});
