import * as http from 'node:http';
import * as https from 'node:https';
import * as dns from 'node:dns';
import * as net from 'node:net';
import * as zlib from 'node:zlib';

/**
 * Fetch for URLs we do NOT control (crawler/scraper input).
 *  - only http(s)
 *  - refuses private / loopback / link-local / metadata addresses, checked at connect time
 *    (so DNS rebinding can't swap the IP after validation) and again on every redirect hop
 *  - bounded redirects, response size (after decompression) and total time
 */

export class UnsafeUrlError extends Error {}
export class ResponseTooLargeError extends Error {}

/** True for any address a public crawler must never connect to. */
export function isPrivateAddress(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local + cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) || // 192.0.0.0/24 + TEST-NETs are non-routable
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast + reserved + broadcast
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd)/.test(x) || /^fe[89ab]/.test(x) || x.startsWith('ff') || x.startsWith('64:ff9b');
  }
  return true; // not an IP at all: refuse
}

/** dns.lookup replacement that refuses to hand out private addresses. */
const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return (callback as any)(err);
    const list = (addresses as dns.LookupAddress[]).filter((a) => !isPrivateAddress(a.address));
    if (!list.length) return (callback as any)(new UnsafeUrlError(`Blocked address for host ${hostname}`));
    if ((options as any)?.all) return (callback as any)(null, list);
    (callback as any)(null, list[0].address, list[0].family);
  });
};

export interface SafeFetchOptions {
  method?: 'GET' | 'HEAD';
  headers?: Record<string, string>;
  timeoutMs?: number; // total, default 20s
  maxBytes?: number; // decompressed body cap, default 5 MB
  maxRedirects?: number; // default 4
}

export interface SafeFetchResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  url: string; // final URL after redirects
}

function assertPublicUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new UnsafeUrlError('Invalid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new UnsafeUrlError('Only http and https URLs are allowed');
  if (u.username || u.password) throw new UnsafeUrlError('URLs with credentials are not allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isPrivateAddress(host)) throw new UnsafeUrlError('Blocked address');
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) throw new UnsafeUrlError('Blocked host name');
  return u;
}

function once(url: URL, opts: Required<Pick<SafeFetchOptions, 'method' | 'maxBytes'>> & { headers: Record<string, string>; deadline: number; lookup: net.LookupFunction }) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const remaining = opts.deadline - Date.now();
    if (remaining <= 0) return reject(new Error('Request timed out'));

    const req = lib.request(
      url,
      { method: opts.method, headers: opts.headers, lookup: opts.lookup, timeout: remaining },
      (res) => {
        const enc = String(res.headers['content-encoding'] || '').toLowerCase();
        const status = res.statusCode || 0;
        if (opts.method === 'HEAD' || (status >= 300 && status < 400)) {
          res.resume();
          return resolve({ status, headers: res.headers, body: Buffer.alloc(0) });
        }
        const declared = Number(res.headers['content-length']);
        if (declared && declared > opts.maxBytes * 20) { // compressed size sanity check
          req.destroy();
          return reject(new ResponseTooLargeError('Response too large'));
        }
        let stream: NodeJS.ReadableStream = res;
        if (enc === 'gzip' || enc === 'x-gzip') stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());

        const chunks: Buffer[] = [];
        let size = 0;
        stream.on('data', (c: Buffer) => {
          size += c.length;
          if (size > opts.maxBytes) {
            req.destroy();
            reject(new ResponseTooLargeError(`Response larger than ${Math.round(opts.maxBytes / 1024)} KB`));
            return;
          }
          chunks.push(c);
        });
        stream.on('end', () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
        stream.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.end();
  });
}

/** `_testOnly.lookup` exists so unit tests can point a fake host at a local server. Never pass it in app code. */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
  _testOnly: { lookup?: net.LookupFunction } = {},
): Promise<SafeFetchResult> {
  const method = options.method ?? 'GET';
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 4;
  const deadline = Date.now() + (options.timeoutMs ?? 20_000);
  const headers = { 'Accept-Encoding': 'gzip, deflate, br', ...(options.headers ?? {}) };

  const lookup = _testOnly.lookup ?? safeLookup;
  let url = assertPublicUrl(rawUrl);
  for (let hop = 0; ; hop++) {
    const res = await once(url, { method, maxBytes, headers, deadline, lookup });
    const loc = res.headers.location;
    if (res.status >= 300 && res.status < 400 && loc) {
      if (hop >= maxRedirects) throw new UnsafeUrlError('Too many redirects');
      url = assertPublicUrl(new URL(loc, url).href); // re-validate every hop
      continue;
    }
    return { status: res.status, headers: res.headers, body: res.body, url: url.href };
  }
}

/** Decodes a response body using the charset from Content-Type (falls back to UTF-8). */
export function decodeBody(res: Pick<SafeFetchResult, 'body' | 'headers'>): string {
  const ct = String(res.headers['content-type'] || '');
  const cs = /charset=([\w-]+)/i.exec(ct)?.[1]?.toLowerCase() || 'utf-8';
  try { return new TextDecoder(cs).decode(res.body); } catch { return new TextDecoder('utf-8').decode(res.body); }
}
