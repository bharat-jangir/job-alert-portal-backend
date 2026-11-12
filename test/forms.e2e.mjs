#!/usr/bin/env node
/**
 * Form / CRUD / validation / slug checks for every admin form, against a running API.
 *   API_BASE=http://localhost:5000/api node test/forms.e2e.mjs
 * Creates records prefixed "zz-forms-" and removes them at the end. Logs in once.
 */
const BASE = (process.env.API_BASE || 'http://localhost:5000/api').replace(/\/$/, '');
let token = '', pass = 0, fail = 0;
async function api(method, path, body, tok = token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await res.text(); let j; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  const data = j && typeof j === 'object' && 'meta' in j && 'data' in j ? j.data : j;
  return { status: res.status, data, raw: j };
}
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`); };
const eq = async (name, p, status) => { const r = await p; ok(name, r.status === status, `got ${r.status} ${JSON.stringify(r.raw).slice(0, 200)}`); return r; };
const msg = (r) => JSON.stringify(r.raw);

const login = await api('POST', '/auth/login', { email: 'admin@rojgarresult.com', password: process.env.ADMIN_PASSWORD || 'Admin@123' }, '');
token = login.data?.access_token;
if (!token) { console.error('login failed', login.status); process.exit(1); }
const tag = Date.now().toString(36);
const cleanup = [];

// ───────────── Posts: validation
console.log('\n# posts');
const base = { title: `zz-forms Post ${tag}`, type: 'job', status: 'draft' };
await eq('missing title → 400', api('POST', '/jobs', { type: 'job' }), 400);
await eq('unknown field rejected (forbidNonWhitelisted) → 400', api('POST', '/jobs', { ...base, hack: 1 }), 400);
await eq('bad slug (uppercase/space) → 400', api('POST', '/jobs', { ...base, slug: 'Bad Slug' }), 400);
await eq('bad slug (double hyphen) → 400', api('POST', '/jobs', { ...base, slug: 'a--b' }), 400);
await eq('bad slug (trailing hyphen) → 400', api('POST', '/jobs', { ...base, slug: 'abc-' }), 400);
await eq('bad applyLink → 400', api('POST', '/jobs', { ...base, applyLink: 'javascript:alert(1)' }), 400);
await eq('bad lastDate → 400', api('POST', '/jobs', { ...base, lastDate: 'tomorrow' }), 400);
await eq('bad status → 400', api('POST', '/jobs', { ...base, status: 'live' }), 400);
await eq('bad qualification enum → 400', api('POST', '/jobs', { ...base, qualification: 'KINDERGARTEN' }), 400);
await eq('unknown category type → 400/404', api('POST', '/jobs', { ...base, type: 'nope-type' }).then((r) => ({ ...r, status: r.status === 404 ? 400 : r.status })), 400);
await eq('bad section type → 400', api('POST', '/jobs', { ...base, sections: [{ type: 'video', src: 'x' }] }), 400);
await eq('section link with bad url → 400', api('POST', '/jobs', { ...base, sections: [{ type: 'links', items: [{ label: 'x', url: 'ftp://x' }] }] }), 400);
await eq('bad organizationId → 400', api('POST', '/jobs', { ...base, organizationId: 'abc' }), 400);

// ───────────── Posts: slug behaviour
console.log('\n# post slugs');
const a = await eq('create draft with auto slug → 201', api('POST', '/jobs', base), 201);
const slugA = a.data.slug;
ok('slug auto-generated from title', slugA === `zz-forms-post-${tag}`, slugA);
cleanup.push(() => api('DELETE', `/jobs/id/${a.data._id}`));
const b = await eq('same title again → 201 (slug de-duplicated)', api('POST', '/jobs', base), 201);
ok('duplicate title gets a different slug', b.data.slug !== slugA && b.data.slug.startsWith(slugA), b.data.slug);
cleanup.push(() => api('DELETE', `/jobs/id/${b.data._id}`));
const c = await eq('explicit slug honoured → 201', api('POST', '/jobs', { ...base, title: `zz-forms Custom ${tag}`, slug: `zz-forms-custom-${tag}` }), 201);
ok('explicit slug stored', c.data.slug === `zz-forms-custom-${tag}`);
cleanup.push(() => api('DELETE', `/jobs/id/${c.data._id}`));
const hindi = await eq('non-latin title → 201 with a safe slug', api('POST', '/jobs', { ...base, title: `भर्ती परीक्षा ${tag} Notice` }), 201);
ok('non-latin title yields valid slug', /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(hindi.data.slug), hindi.data.slug);
cleanup.push(() => api('DELETE', `/jobs/id/${hindi.data._id}`));
await eq('draft is hidden from public → 404', api('GET', `/jobs/${slugA}`, undefined, ''), 404);
await eq('draft readable by id with auth → 200', api('GET', `/jobs/id/${a.data._id}`), 200);
await eq('draft by id without auth → 401', api('GET', `/jobs/id/${a.data._id}`, undefined, ''), 401);
const pub = await eq('publish → 200', api('PATCH', `/jobs/id/${a.data._id}`, { status: 'published' }), 200);
ok('publishedAt set on publish', !!pub.data.publishedAt);
await eq('published is public → 200', api('GET', `/jobs/${slugA}`, undefined, ''), 200);
await eq('rename slug onto an existing one → de-duplicated, not 500', api('PATCH', `/jobs/id/${a.data._id}`, { slug: `zz-forms-custom-${tag}` }), 200);
const back = await eq('rename slug (new) → 200', api('PATCH', `/jobs/id/${a.data._id}`, { slug: `zz-forms-renamed-${tag}`, revisionNote: 'rename' }), 200);
ok('renamed slug stored', back.data.slug === `zz-forms-renamed-${tag}`);
const old = await api('GET', `/jobs/${slugA}`, undefined, '');
ok('old slug still resolves to the post (frontend redirects)', old.status === 200 && old.data.slug === `zz-forms-renamed-${tag}`, msg(old).slice(0, 150));
const revs = await eq('revisions list → 200', api('GET', `/jobs/id/${a.data._id}/revisions`), 200);
ok('revisions recorded', Array.isArray(revs.data) && revs.data.length >= 2, msg(revs).slice(0, 150));
await eq('PATCH with empty slug string is ignored → 200', api('PATCH', `/jobs/id/${a.data._id}`, { slug: '' }), 200);
await eq('PATCH bad mongo id → 400/404', api('PATCH', '/jobs/id/not-an-id', { title: 'x' }).then((r) => ({ ...r, status: [400, 404].includes(r.status) ? 400 : r.status })), 400);
await eq('PATCH unknown id → 404', api('PATCH', '/jobs/id/64b64b64b64b64b64b64b64b', { title: 'x' }), 404);
await eq('DELETE unknown id → 404', api('DELETE', '/jobs/id/64b64b64b64b64b64b64b64b'), 404);
const html = await eq('script in htmlContent is sanitised on save → 201', api('POST', '/jobs', { ...base, title: `zz-forms XSS ${tag}`, htmlContent: '<p>hi</p><script>alert(1)</script><img src=x onerror=alert(1)>' }), 201);
ok('script/onerror stripped', !/script|onerror/i.test(html.data.htmlContent || ''), html.data.htmlContent);
cleanup.push(() => api('DELETE', `/jobs/id/${html.data._id}`));

// ───────────── Organizations
console.log('\n# organizations');
await eq('org without name → 400', api('POST', '/organizations', {}), 400);
await eq('org bad slug → 400', api('POST', '/organizations', { name: `zz-forms Org ${tag}`, slug: 'Bad Slug!' }), 400);
await eq('org bad logo url → 400', api('POST', '/organizations', { name: `zz-forms Org ${tag}`, logo: 'not a url' }), 400);
const org = await eq('create org → 201', api('POST', '/organizations', { name: `zz-forms Org ${tag}`, logo: '', slug: '' }), 201);
ok('org slug auto-generated', org.data.slug === `zz-forms-org-${tag}`, org.data.slug);
cleanup.push(() => api('DELETE', `/organizations/${org.data._id}`));
await eq('duplicate org name → 409', api('POST', '/organizations', { name: `zz-forms Org ${tag}` }), 409);
await eq('update org name → 200', api('PATCH', `/organizations/${org.data._id}`, { description: 'x' }), 200);
await eq('org get unknown → 404', api('GET', '/organizations/64b64b64b64b64b64b64b64b'), 404);

// ───────────── Categories
console.log('\n# categories');
await eq('category bad slug → 400', api('POST', '/job-categories', { name: 'X', slug: 'Bad Slug' }), 400);
await eq('category duplicate slug → 409', api('POST', '/job-categories', { name: 'Job again', slug: 'job' }), 409);
// Categories can only be soft-deleted through the API, so reuse one fixed test category
// (restore it if a previous run soft-deleted it) instead of leaving a new hidden one per run.
const CAT_SLUG = 'zz-forms-cat';
const prior = ((await api('GET', '/job-categories')).data || []).find((c) => c.slug === CAT_SLUG);
let cat;
if (prior) { cat = await eq('restore existing test category → 200', api('PATCH', `/job-categories/${prior._id}`, { isDeleted: false }), 200); }
else { cat = await eq('create category → 201', api('POST', '/job-categories', { name: 'zz-forms Cat', slug: CAT_SLUG, sequenceNo: 99 }), 201); }
const catId = cat.data._id;
cleanup.push(() => api('DELETE', `/job-categories/${catId}`)); // runs last (cleanup is LIFO)
await eq('create post in new category → 201', api('POST', '/jobs', { ...base, title: `zz-forms InCat ${tag}`, type: CAT_SLUG }).then(async (r) => { if (r.data?._id) cleanup.push(() => api('DELETE', `/jobs/id/${r.data._id}`)); return r; }), 201);
await eq('cannot change slug of category with posts → 409', api('PATCH', `/job-categories/${catId}`, { slug: 'zz-forms-cat2' }), 409);
await eq('cannot delete category with posts → 409', api('DELETE', `/job-categories/${catId}`), 409);

// ───────────── FAQs
console.log('\n# faqs');
await eq('faq too short → 400', api('POST', '/faqs', { question: 'a', answer: 'b' }), 400);
await eq('faq order must be number → 400', api('POST', '/faqs', { question: 'valid question?', answer: 'valid answer', order: 'first' }), 400);
const faq = await eq('create faq → 201', api('POST', '/faqs', { question: `zz-forms question ${tag}?`, answer: 'valid answer text', order: 999 }), 201);
cleanup.push(() => api('DELETE', `/faqs/${faq.data._id}`));
await eq('update faq → 200', api('PATCH', `/faqs/${faq.data._id}`, { answer: 'changed answer text' }), 200);
const pf = await api('GET', '/faqs/public', undefined, '');
ok('faq visible publicly', (pf.data || []).some((f) => f._id === faq.data._id));
await api('PATCH', `/faqs/${faq.data._id}`, { isActive: false });
const pf2 = await api('GET', '/faqs/public', undefined, '');
ok('inactive faq hidden publicly', !(pf2.data || []).some((f) => f._id === faq.data._id));

// ───────────── Redirect links
console.log('\n# redirect links');
await eq('link bad type → 400', api('POST', '/redirect-links', { type: 'NOPE', redirectType: 'internal' }), 400);
await eq('link bad redirectType → 400', api('POST', '/redirect-links', { type: 'JOB', redirectType: 'sideways' }), 400);
await eq('link bad external url → 400', api('POST', '/redirect-links', { type: 'JOB', redirectType: 'external', externalUrl: 'nope' }), 400);
const link = await eq('create link → 201', api('POST', '/redirect-links', { type: 'JOB', redirectType: 'internal', slug: `zz-forms-${tag}`, title: 'zz-forms link', tag: 'zz-forms' }), 201);
cleanup.push(() => api('DELETE', `/redirect-links/${link.data._id}`));
await eq('update link → 200', api('PATCH', `/redirect-links/${link.data._id}`, { title: 'zz-forms link 2' }), 200);

// ───────────── Contact form
console.log('\n# contact');
await eq('contact bad email → 400', api('POST', '/contact', { name: 'ab', email: 'nope', subject: 'subject', message: 'long enough message' }, ''), 400);
await eq('contact short message → 400', api('POST', '/contact', { name: 'ab', email: 'a@b.co', subject: 'subject', message: 'short' }, ''), 400);
const cq = await eq('contact valid → 201', api('POST', '/contact', { name: 'Forms Test', email: `zz-forms+${tag}@example.com`, subject: 'zz-forms subject', message: 'this is long enough message' }, ''), 201);
cleanup.push(() => api('DELETE', `/contact/${cq.data._id}`));
await eq('contact status invalid → 400', api('PATCH', `/contact/${cq.data._id}`, { status: 'Maybe' }), 400);
await eq('contact status valid → 200', api('PATCH', `/contact/${cq.data._id}`, { status: 'Resolved' }), 200);

// ───────────── Users
console.log('\n# users');
await eq('user bad email → 400', api('POST', '/users', { name: 'X', email: 'nope', password: 'Passw0rd!x', role: 'editor' }), 400);
await eq('user short password → 400', api('POST', '/users', { name: 'X', email: `zz-forms-${tag}@example.com`, password: '123', role: 'editor' }), 400);
await eq('user bad role → 400', api('POST', '/users', { name: 'X', email: `zz-forms-${tag}@example.com`, password: 'Passw0rd!x', role: 'god' }), 400);
const u = await eq('create user → 201', api('POST', '/users', { name: 'Forms User', email: `zz-forms-${tag}@example.com`, password: 'Passw0rd!x', role: 'editor' }), 201);
ok('password hash never returned', !JSON.stringify(u.raw).includes('password'));
cleanup.push(() => api('DELETE', `/users/${u.data._id || u.data.id}`));
await eq('duplicate user email → 409', api('POST', '/users', { name: 'Forms User', email: `zz-forms-${tag}@example.com`, password: 'Passw0rd!x', role: 'editor' }), 409);

// ───────────── Content blocks (the structured-content model)
console.log('\n# content blocks');
const mkBlockPost = (sections, title = `zz-forms Blocks ${tag}-${Math.random().toString(36).slice(2, 6)}`) =>
  api('POST', '/jobs', { title, type: 'job', status: 'draft', sections });
const okBlock = async (name, section) => {
  const r = await mkBlockPost([section]);
  ok(`accepts ${name}`, r.status === 201, `${r.status} ${msg(r).slice(0, 200)}`);
  if (r.data?._id) cleanup.push(() => api('DELETE', `/jobs/id/${r.data._id}`));
  return r;
};
const badBlock = async (name, section) => {
  const r = await mkBlockPost([section]);
  ok(`rejects ${name} → 400`, r.status === 400, `${r.status} ${msg(r).slice(0, 160)}`);
  if (r.data?._id) cleanup.push(() => api('DELETE', `/jobs/id/${r.data._id}`));
};
const U = 'https://example.com/x';
await okBlock('paragraph', { type: 'paragraph', text: 'Hi **bold** [l](https://example.com)' });
await okBlock('heading', { type: 'heading', level: 3, text: 'H' });
await okBlock('list', { type: 'list', ordered: true, items: ['a'] });
await okBlock('steps', { type: 'steps', items: ['a'] });
await okBlock('table with align', { type: 'table', headers: ['a', 'b'], rows: [['1', '2']], align: ['left', 'right'] });
await okBlock('keyvalue', { type: 'keyvalue', items: [{ label: 'a', value: 'b' }] });
await okBlock('timeline', { type: 'timeline', items: [{ date: '1 Jan', title: 't' }] });
await okBlock('accordion', { type: 'accordion', items: [{ title: 't', content: 'c' }] });
await okBlock('faq', { type: 'faq', items: [{ question: 'q', answer: 'a' }] });
await okBlock('image', { type: 'image', src: U + '.jpg', alt: 'alt', width: 10, height: 10 });
await okBlock('image with empty alt (decorative)', { type: 'image', src: U + '.jpg' });
await okBlock('gallery', { type: 'gallery', images: [{ src: U + '.jpg', alt: 'a' }] });
await okBlock('YouTube video', { type: 'video', url: 'https://www.youtube.com/watch?v=abc', title: 't' });
await okBlock('youtu.be video', { type: 'video', url: 'https://youtu.be/abc', title: 't' });
await okBlock('Vimeo video', { type: 'video', url: 'https://vimeo.com/123', title: 't' });
await okBlock('audio', { type: 'audio', src: U + '.mp3' });
await okBlock('Google Docs embed', { type: 'embed', url: 'https://docs.google.com/document/d/x/preview', title: 't', height: 400 });
await okBlock('Google Maps embed', { type: 'embed', url: 'https://www.google.com/maps/embed?pb=1', title: 't' });
await okBlock('code', { type: 'code', code: 'x', language: 'js' });
await okBlock('quote (pull)', { type: 'quote', text: 'q', style: 'pull' });
await okBlock('button', { type: 'button', label: 'b', url: U, style: 'outline', align: 'center' });
await okBlock('download', { type: 'download', label: 'd', url: U + '.pdf', fileType: 'pdf', size: '1 MB' });
await okBlock('separator', { type: 'separator', style: 'dots' });
await okBlock('toc', { type: 'toc' });
await okBlock('ad slot', { type: 'ad', slot: 'in-article-1' });
await okBlock('columns with nested blocks', { type: 'columns', columns: [{ blocks: [{ type: 'paragraph', text: 'a' }, { type: 'image', src: U + '.jpg' }] }, { blocks: [] }, { blocks: [{ type: 'button', label: 'b', url: U }] }] });
await okBlock('html', { type: 'html', html: '<p>x</p>' });

await badBlock('unknown block type', { type: 'carousel', items: [] });
await badBlock('image with ftp url', { type: 'image', src: 'ftp://x/y.jpg' });
await badBlock('image with javascript url', { type: 'image', src: 'javascript:alert(1)' });
await badBlock('video from an untrusted host', { type: 'video', url: 'https://evil.example.com/v', title: 't' });
await badBlock('video without a title', { type: 'video', url: 'https://youtu.be/abc' });
await badBlock('embed from an untrusted host', { type: 'embed', url: 'https://evil.example.com/x', title: 't' });
await badBlock('embed of an arbitrary google.com page', { type: 'embed', url: 'https://www.google.com/search?q=x', title: 't' });
await badBlock('embed height out of range', { type: 'embed', url: 'https://docs.google.com/x', title: 't', height: 50 });
await badBlock('ad slot with spaces/uppercase', { type: 'ad', slot: 'Bad Slot' });
await badBlock('button with javascript url', { type: 'button', label: 'b', url: 'javascript:alert(1)' });
await badBlock('button with bad style', { type: 'button', label: 'b', url: U, style: 'neon' });
await badBlock('table with bad alignment', { type: 'table', headers: ['a'], rows: [['1']], align: ['justify'] });
await badBlock('columns with a single column', { type: 'columns', columns: [{ blocks: [] }] });
await badBlock('columns with five columns', { type: 'columns', columns: [1, 2, 3, 4, 5].map(() => ({ blocks: [] })) });
await badBlock('nested columns', { type: 'columns', columns: [{ blocks: [{ type: 'columns', columns: [{ blocks: [] }, { blocks: [] }] }] }, { blocks: [] }] });
await badBlock('html inside columns', { type: 'columns', columns: [{ blocks: [{ type: 'html', html: '<p>x</p>' }] }, { blocks: [] }] });
await badBlock('code that is not a string', { type: 'code', code: 123 });
await badBlock('quote without text', { type: 'quote' });
await badBlock('timeline item without date', { type: 'timeline', items: [{ title: 't' }] });
await badBlock('heading level 1', { type: 'heading', level: 1, text: 'h' });

const big = await mkBlockPost(Array.from({ length: 151 }, () => ({ type: 'separator' })));
ok('rejects more than 150 blocks → 400', big.status === 400);

const rt = await mkBlockPost([{ type: 'html', html: '<p>ok</p><script>x()</script><iframe src="https://evil.example.com"></iframe><iframe src="https://www.youtube.com/embed/abc"></iframe>' }]);
const h = rt.data?.sections?.[0]?.html || '';
ok('html block: script and untrusted iframe stripped, YouTube iframe kept', !/script|evil\.example|<iframe><\/iframe>/.test(h) && /youtube\.com\/embed\/abc/.test(h), h);
if (rt.data?._id) cleanup.push(() => api('DELETE', `/jobs/id/${rt.data._id}`));

// duplicate
const rich = await mkBlockPost([{ type: 'paragraph', text: 'copy me' }, { type: 'toc' }], `zz-forms Dup Source ${tag}`);
cleanup.push(() => api('DELETE', `/jobs/id/${rich.data._id}`));
await api('PATCH', `/jobs/id/${rich.data._id}`, { status: 'published', canonicalUrl: 'https://example.com/canon', tags: ['zz-forms'] });
const dup = await eq('duplicate post → 201', api('POST', `/jobs/id/${rich.data._id}/duplicate`), 201);
cleanup.push(() => api('DELETE', `/jobs/id/${dup.data._id}`));
ok('duplicate is a draft', dup.data.status === 'draft');
ok('duplicate has "(Copy)" title and a new slug', /\(Copy\)$/.test(dup.data.title) && dup.data.slug !== rich.data.slug, `${dup.data.title} / ${dup.data.slug}`);
ok('duplicate keeps content blocks and tags', dup.data.sections?.length === 2 && dup.data.tags?.includes('zz-forms'));
ok('duplicate does not copy canonicalUrl / stats / publishedAt', !dup.data.canonicalUrl && !dup.data.views && !dup.data.publishedAt);
await eq('duplicate unknown id → 404', api('POST', '/jobs/id/64b64b64b64b64b64b64b64b/duplicate'), 404);
await eq('duplicate requires auth → 401', api('POST', `/jobs/id/${rich.data._id}/duplicate`, undefined, ''), 401);

// ───────────── cleanup
for (const fn of cleanup.reverse()) { try { await fn(); } catch {} }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
