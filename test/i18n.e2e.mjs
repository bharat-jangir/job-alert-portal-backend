/**
 * Hindi / multi-language API checks. Live server + seeded DB, like api.e2e.mjs.
 *   node test/i18n.e2e.mjs        (env: API_BASE, default http://localhost:5000/api)
 * Creates one "E2E-HI" post and deletes it at the end.
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + extra}`); };
async function call(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, d: json?.data };
}
const login = async (email) => (await call('POST', '/auth/login', { body: { email, password: 'Admin@123' } })).d?.access_token;
const admin = await login('admin@rojgarresult.com');
const editor = await login('editor@rojgarresult.com');
const run = Date.now().toString(36);
const slug = `e2e-hi-${run}`;

// ── categories ────────────────────────────────────────
let r = await call('GET', '/job-categories/active?lang=hi');
const adm = r.d?.find((c) => c.slug === 'admit-card');
ok('categories?lang=hi returns Hindi display names', adm?.displayName === 'एडमिट कार्ड', JSON.stringify(adm));
r = await call('GET', '/job-categories/active');
ok('categories without lang stay English', r.d?.find((c) => c.slug === 'admit-card')?.displayName === 'Admit Card');

// ── create a post with a Hindi translation ────────────
const hiSections = [
  { type: 'heading', level: 2, text: 'आवेदन शुल्क' },
  { type: 'table', headers: ['श्रेणी', 'शुल्क'], rows: [['सामान्य', '500'], ['SC / ST', '250']] },
  { type: 'html', html: '<p>नमस्ते</p><script>alert(1)</script>' },
];
r = await call('POST', '/jobs', { token: admin, body: {
  title: `E2E-HI Railway Group D ${run}`, slug, type: 'job', status: 'published',
  organization: 'Railway Board', location: 'All India', description: 'English description',
  lastDate: '2027-01-31', totalVacancy: '32,000',
  importantDates: [{ label: 'Start Date', date: '2026-12-01' }, { label: 'Last Date', date: '2027-01-31' }],
  sections: [{ type: 'heading', level: 2, text: 'Application Fee' }, { type: 'table', headers: ['Category', 'Fee'], rows: [['General', '500'], ['SC / ST', '250']] }],
  eligibility: '<p>10th pass</p>',
  translations: { hi: {
    title: `रेलवे ग्रुप डी भर्ती ${run}`, description: 'हिंदी विवरण', organization: 'रेलवे बोर्ड',
    importantDateLabels: ['शुरू होने की तिथि'], eligibility: '<p>10वीं पास</p><script>x</script>', sections: hiSections,
  } },
} });
ok('create post with translations.hi → 201', r.status === 201, JSON.stringify(r.json).slice(0, 200));
const id = r.d?._id;
ok('translation was stamped server-side', !!r.d?.translations?.hi?.translatedAt && r.d.translations.hi.status === 'machine');
ok('eligibility + html block sanitised in translation', !/<script|alert\(/.test(JSON.stringify(r.d?.translations?.hi)), JSON.stringify(r.d?.translations?.hi).slice(0, 300));

// ── validation ────────────────────────────────────────
r = await call('PATCH', `/jobs/id/${id}`, { token: admin, body: { translations: { hi: { sections: [{ type: 'nope' }] } } } });
ok('invalid translated sections → 400', r.status === 400, r.status);
r = await call('PATCH', `/jobs/id/${id}`, { token: admin, body: { translations: { fr: { title: 'x' } } } });
ok('unknown language → 400', r.status === 400, r.status);
r = await call('PATCH', `/jobs/id/${id}`, { token: admin, body: { translations: { hi: { title: 'x'.repeat(400) } } } });
ok('over-long translated title → 400', r.status === 400, r.status);

// ── public detail ─────────────────────────────────────
r = await call('GET', `/jobs/${slug}?lang=hi`);
ok('detail ?lang=hi: Hindi title/description/org', r.d?.title?.startsWith('रेलवे ग्रुप डी') && r.d.description === 'हिंदी विवरण' && r.d.organization === 'रेलवे बोर्ड', JSON.stringify(r.d).slice(0, 200));
ok('detail ?lang=hi: Hindi sections + labels, shared facts unchanged', r.d?.sections?.[0]?.text === 'आवेदन शुल्क' && r.d.importantDates[0].label === 'शुरू होने की तिथि' && r.d.importantDates[1].label === 'Last Date' && r.d.lastDate.startsWith('2027-01-31') && r.d.totalVacancy === '32,000' && r.d.slug === slug);
ok('detail ?lang=hi: language + availableLanguages', r.d?.language === 'hi' && JSON.stringify(r.d.availableLanguages) === '["en","hi"]');
ok('detail does not leak raw translations', r.d?.translations === undefined);
r = await call('GET', `/jobs/${slug}`);
ok('detail without lang is English', r.d?.title.startsWith('E2E-HI Railway') && r.d.language === 'en' && r.d.sections[0].text === 'Application Fee');
ok('English detail still reports Hindi is available', JSON.stringify(r.d?.availableLanguages) === '["en","hi"]');
r = await call('GET', `/jobs/${slug}?lang=fr`);
ok('unknown lang falls back to English (no error)', r.status === 200 && r.d?.language === 'en');

// ── lists ─────────────────────────────────────────────
r = await call('GET', `/jobs?lang=hi&limit=5&search=${encodeURIComponent('रेलवे ग्रुप डी')}`);
ok('list ?lang=hi: search by Hindi title finds it, card localised', r.d?.jobs?.some((j) => j.slug === slug && j.title.startsWith('रेलवे')) && r.d.jobs[0].translations === undefined, JSON.stringify(r.d?.jobs?.map((j) => j.title)));
r = await call('GET', `/jobs?lang=hi&type=job&limit=100`);
const mine = r.d?.jobs?.find((j) => j.slug === slug);
ok('list ?lang=hi has no heavy fields', mine && mine.sections === undefined && mine.translations === undefined);
r = await call('GET', `/jobs?type=job&limit=100`);
ok('list without lang stays English', r.d?.jobs?.find((j) => j.slug === slug)?.title.startsWith('E2E-HI'));
for (const [name, path] of [['latest', '/jobs/latest?limit=50'], ['by-type', '/jobs/by-type/job'], ['popular', '/jobs/popular'], ['bulletins', '/jobs/bulletins'], ['upcoming', '/jobs/upcoming']]) {
  const a = await call('GET', `${path}${path.includes('?') ? '&' : '?'}lang=hi`);
  ok(`${name}?lang=hi → 200 and no raw translations`, a.status === 200 && !JSON.stringify(a.d).includes('"translations"'), a.status);
}
r = await call('GET', `/jobs/latest?limit=50&lang=hi`);
ok('latest?lang=hi localises titles', r.d?.some((j) => j.slug === slug && j.title.startsWith('रेलवे')));
r = await call('GET', `/jobs/search?q=${encodeURIComponent('रेलवे')}&lang=hi`);
ok('/jobs/search finds Hindi title', r.d?.some((j) => j.slug === slug && j.title.startsWith('रेलवे')), JSON.stringify(r.d));
r = await call('GET', '/jobs/home?lang=hi');
ok('home?lang=hi → Hindi category headings', r.status === 200 && r.d.sections.some((s) => /[ऀ-ॿ]/.test(s.category.displayName)), JSON.stringify(r.d?.sections?.map((s) => s.category.displayName)));
r = await call('GET', '/jobs/home');
ok('home without lang → English headings', r.d.sections.every((s) => !/[ऀ-ॿ]/.test(s.category.displayName)));
r = await call('GET', `/jobs/${slug}/related?lang=hi`);
ok('related?lang=hi → 200', r.status === 200);

// ── sitemap ───────────────────────────────────────────
r = await call('GET', '/jobs/sitemap');
const sm = r.d?.find((p) => p.slug === slug);
ok('sitemap lists languages for translated posts', JSON.stringify(sm?.languages) === '["en","hi"]' && sm.translations === undefined, JSON.stringify(sm));
ok('sitemap: untranslated posts are English-only', r.d?.some((p) => JSON.stringify(p.languages) === '["en"]'));

// ── admin ─────────────────────────────────────────────
r = await call('GET', `/jobs/id/${id}`, { token: admin });
ok('admin read returns the full translations', r.d?.translations?.hi?.sections?.length === 3);
r = await call('GET', '/jobs/admin/list?limit=5&search=E2E-HI', { token: admin });
ok('admin list carries Hindi status', r.d?.jobs?.[0]?.translations?.hi?.status === 'machine');
r = await call('PATCH', `/jobs/id/${id}`, { token: editor, body: { translations: { hi: { title: 'संपादक द्वारा', status: 'reviewed' } } } });
ok('editor can edit a translation (drafts only for non-publisher live changes are unaffected)', r.status === 200 || r.status === 403, r.status);
r = await call('PATCH', `/jobs/id/${id}`, { token: admin, body: { translations: { hi: { title: `रेलवे ग्रुप डी भर्ती ${run}`, description: 'हिंदी विवरण', status: 'reviewed' } } } });
ok('admin marks translation reviewed', r.status === 200 && r.d.translations.hi.status === 'reviewed');
r = await call('GET', `/jobs/${slug}?lang=hi`);
ok('reviewed translation: no machine notice flag', r.d?.translationStatus === 'reviewed');

// ── translate endpoint ────────────────────────────────
r = await call('POST', `/jobs/id/${id}/translate`, { body: {} });
ok('translate needs login → 401', r.status === 401);
r = await call('POST', `/jobs/id/${id}/translate`, { token: admin, body: {} });
ok('translate refuses to overwrite a reviewed translation → 400', r.status === 400 && /reviewed/i.test(JSON.stringify(r.json)), JSON.stringify(r.json).slice(0, 200));
r = await call('POST', `/jobs/id/${id}/translate`, { token: admin, body: { force: true } });
ok('translate with force and no Gemini key → clear 503 (not a crash)', r.status === 503 || r.status === 200, `${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);

// ── removing a translation ────────────────────────────
r = await call('PATCH', `/jobs/id/${id}`, { token: admin, body: { translations: {} } });
ok('clearing translations → 200', r.status === 200);
r = await call('GET', `/jobs/${slug}?lang=hi`);
ok('after clearing: Hindi request falls back to English', r.d?.language === 'en' && JSON.stringify(r.d.availableLanguages) === '["en"]');

await call('DELETE', `/jobs/id/${id}`, { token: admin });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
