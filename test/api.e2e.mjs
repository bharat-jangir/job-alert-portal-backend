/**
 * API smoke/regression suite. Runs against a live server + a SEEDED database:
 *   npm run seed:admin && npm run seed && node dist/src/main   (then)   node test/api.e2e.mjs
 * Env: API_BASE (default http://localhost:5000/api)
 * Uses the 4 users from scripts/seedAdmin.ts. Creates (and leaves behind) a few "E2E ..." posts.
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + extra}`);
};

async function call(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const login = async (email, password = 'Admin@123') => {
  const r = await call('POST', '/auth/login', { body: { email, password } });
  return { ...r, token: r.json?.data?.access_token };
};
const run = Date.now().toString(36);

// ── authentication ───────────────────────────────────
let r = await call('POST', '/jobs', { body: { title: 'x' } });
ok('unauthenticated create → 401', r.status === 401, r.status);
r = await login('admin@rojgarresult.com', 'wrong');
ok('bad password → 401', r.status === 401, r.status);
const admin = await login('admin@rojgarresult.com');
const publisher = await login('publisher@rojgarresult.com');
const editor = await login('editor@rojgarresult.com');
const viewer = await login('viewer@rojgarresult.com');
ok('4 seeded roles can log in', [admin, publisher, editor, viewer].every((u) => u.status === 200 && u.token));
ok('login response has user, no password', admin.json.data.user.role === 'super-admin' && !JSON.stringify(admin.json).includes('"password"'));

// ── users ────────────────────────────────────────────
r = await call('GET', '/users', { token: admin.token });
ok('users list has NO password hashes', r.status === 200 && !JSON.stringify(r.json).includes('"password"'), JSON.stringify(r.json).slice(0, 150));
r = await call('GET', '/users', { token: editor.token });
ok('editor cannot list users → 403', r.status === 403);
r = await call('POST', '/users', { token: admin.token, body: { name: 'Temp Person', email: `temp-${run}@example.com`, password: 'password123', role: 'editor' } });
ok('create user response has no password', r.status === 201 && !('password' in r.json.data), JSON.stringify(r.json).slice(0, 200));
const tempId = r.json?.data?._id;
const tempLogin = await login(`temp-${run}@example.com`, 'password123');
ok('new user can log in', tempLogin.status === 200);
r = await call('PATCH', `/users/${tempId}`, { token: admin.token, body: { isActive: false } });
ok('admin deactivates user', r.status === 200 && r.json.data.isActive === false);
r = await call('GET', '/auth/profile', { token: tempLogin.token });
ok('deactivated user token is rejected immediately', r.status === 401, r.status);
r = await login(`temp-${run}@example.com`, 'password123');
ok('deactivated user cannot log in again', r.status === 401, r.status);
const meId = admin.json.data.user.id;
r = await call('PATCH', `/users/${meId}`, { token: admin.token, body: { isActive: false } });
ok('cannot deactivate yourself → 400', r.status === 400);
r = await call('DELETE', `/users/${tempId}`, { token: admin.token });
ok('delete user', r.status === 204);
r = await call('POST', '/auth/change-password', { token: viewer.token, body: { currentPassword: 'nope', newPassword: 'newpassword123' } });
ok('change-password with wrong current → 400', r.status === 400, r.status);

// ── roles on posts ───────────────────────────────────
const form = {
  title: `E2E Recruitment ${run}`, slug: '', htmlContent: '', organization: '', organizationId: '', location: 'Bihar',
  salary: '₹30,000 per month', qualification: 'BACHELORS', experience: 'ENTRY', lastDate: '', applyLink: '',
  description: 'E2E description', eligibility: '', totalVacancy: '50 posts', ageLimit: '18-30 Years', isBulletin: false,
  tags: ['e2e'], importantDates: [{ label: 'Start', date: '' }], metaTitle: '', metaDescription: '', sourceUrl: '',
  type: 'job', categoryId: '', sections: [{ type: 'paragraph', text: 'Hello' }],
};
r = await call('POST', '/jobs', { token: viewer.token, body: form });
ok('viewer cannot create → 403', r.status === 403, r.status);
r = await call('POST', '/jobs', { token: editor.token, body: { ...form, status: 'published' } });
ok('editor cannot publish → 403', r.status === 403, r.status);
r = await call('POST', '/jobs', { token: editor.token, body: form });
ok('editor saves draft from form payload with empty strings → 201', r.status === 201 && r.json.data.status === 'draft', JSON.stringify(r.json).slice(0, 300));
const draft = r.json.data;
ok('slug generated from title', draft.slug === `e2e-recruitment-${run}`, draft.slug);
ok('categoryId derived from type', !!draft.categoryId);
ok('publishedAt not set on a draft', !draft.publishedAt);
r = await call('GET', `/jobs/${draft.slug}`);
ok('draft is NOT public → 404', r.status === 404, r.status);
r = await call('GET', `/jobs/id/${draft._id}`);
ok('GET /jobs/id/:id requires auth now (was a draft leak) → 401', r.status === 401, r.status);
r = await call('PATCH', `/jobs/id/${draft._id}`, { token: editor.token, body: { status: 'review' } });
ok('editor submits for review', r.status === 200 && r.json.data.status === 'review');
r = await call('PATCH', `/jobs/id/${draft._id}`, { token: editor.token, body: { status: 'published' } });
ok('editor cannot publish via update → 403', r.status === 403);
r = await call('PATCH', `/jobs/id/${draft._id}`, { token: publisher.token, body: { status: 'published' } });
ok('publisher publishes', r.status === 200 && r.json.data.status === 'published' && !!r.json.data.publishedAt, JSON.stringify(r.json).slice(0, 200));
r = await call('GET', `/jobs/${draft.slug}`);
ok('published post is public, includes sections[]', r.status === 200 && Array.isArray(r.json.data.sections) && r.json.data.sections.length === 1, r.status);
ok('public detail hides internals', !('previousSlugs' in r.json.data) && !('authorId' in r.json.data));
r = await call('PATCH', `/jobs/id/${draft._id}`, { token: editor.token, body: { description: 'edited by editor' } });
ok('editor can still edit live content (existing behaviour)', r.status === 200 && r.json.data.description === 'edited by editor');
r = await call('PATCH', `/jobs/id/${draft._id}`, { token: editor.token, body: { status: 'archived' } });
ok('editor cannot archive a live post → 403', r.status === 403);
r = await call('DELETE', `/jobs/id/${draft._id}`, { token: editor.token });
ok('editor cannot delete → 403', r.status === 403);

// ── validation ───────────────────────────────────────
r = await call('POST', '/jobs', { token: admin.token, body: { ...form, title: 'Bad type', type: 'nonsense' } });
ok('unknown post type → 400', r.status === 400, r.status);
r = await call('POST', '/jobs', { token: admin.token, body: { ...form, title: 'Bad sections', sections: [{ type: 'table', headers: ['a'], rows: 'nope' }] } });
ok('invalid sections → 400 with path', r.status === 400 && JSON.stringify(r.json).includes('sections'), JSON.stringify(r.json).slice(0, 200));
r = await call('POST', '/jobs', { token: admin.token, body: { ...form, title: 'Bad link', sections: [{ type: 'links', items: [{ label: 'x', url: 'javascript:alert(1)' }] }] } });
ok('javascript: URL in a links section rejected', r.status === 400, r.status);
r = await call('POST', '/jobs', { token: admin.token, body: { ...form, title: 'Unknown field', evil: 1 } });
ok('unknown field rejected', r.status === 400);
r = await call('POST', '/jobs', { token: admin.token, body: { ...form, title: 'Sched past', status: 'scheduled', scheduledAt: new Date(Date.now() - 3600e3).toISOString() } });
ok('scheduled in the past → 400', r.status === 400);

// ── sanitising ───────────────────────────────────────
r = await call('POST', '/jobs', { token: admin.token, body: { ...form, title: `E2E XSS ${run}`, status: 'published',
  htmlContent: '<p onclick="x()">hi</p><script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="https://example.com">ok</a><iframe src="https://evil.example/x"></iframe><iframe src="https://www.youtube.com/embed/abc"></iframe>',
  sections: [{ type: 'html', html: '<img src=x onerror=alert(1)><table><tr><td>cell</td></tr></table>' }] } });
ok('admin creates + publishes in one step', r.status === 201 && r.json.data.status === 'published', JSON.stringify(r.json).slice(0, 200));
const x = r.json.data;
ok('script stripped', !x.htmlContent.includes('<script'));
ok('onclick stripped', !x.htmlContent.includes('onclick'));
ok('javascript: href stripped', !x.htmlContent.includes('javascript:'));
ok('external link gets rel nofollow', x.htmlContent.includes('rel="noopener noreferrer nofollow"'));
ok('untrusted iframe host removed, youtube kept', !x.htmlContent.includes('evil.example') && x.htmlContent.includes('youtube.com/embed/abc'), x.htmlContent);
ok('onerror stripped in html section; table kept', !JSON.stringify(x.sections).includes('onerror') && JSON.stringify(x.sections).includes('<table>'));

// ── slug rename keeps the old URL working ────────────
r = await call('PATCH', `/jobs/id/${x._id}`, { token: admin.token, body: { slug: `e2e-xss-renamed-${run}`, revisionNote: 'renamed' } });
ok('rename slug', r.status === 200 && r.json.data.slug === `e2e-xss-renamed-${run}`);
r = await call('GET', `/jobs/${x.slug}`);
ok('old slug resolves to the post whose slug differs (frontend → 301)', r.status === 200 && r.json.data.slug === `e2e-xss-renamed-${run}`, JSON.stringify(r.json).slice(0, 150));
r = await call('POST', '/jobs', { token: admin.token, body: { ...form, title: 'Clash', slug: `e2e-xss-renamed-${run}` } });
ok('slug clash auto-suffixed', r.status === 201 && r.json.data.slug === `e2e-xss-renamed-${run}-2`, r.json?.data?.slug);

// ── revisions ────────────────────────────────────────
r = await call('PATCH', `/jobs/id/${x._id}`, { token: admin.token, body: { title: `E2E XSS v2 ${run}` } });
r = await call('GET', `/jobs/id/${x._id}/revisions`, { token: admin.token });
ok('revisions recorded (2)', r.status === 200 && r.json.data.length === 2, JSON.stringify(r.json).slice(0, 160));
const firstRev = r.json.data[r.json.data.length - 1];
r = await call('POST', `/jobs/id/${x._id}/revisions/${firstRev._id}/restore`, { token: admin.token });
ok('restore revision 1 → original title, still published', r.status === 200 && r.json.data.title === `E2E XSS ${run}` && r.json.data.status === 'published', r.json?.data?.title);

// ── public listing / search / aggregates ─────────────
r = await call('GET', '/jobs?limit=500');
ok('GET /jobs keeps { jobs, total } shape (used by sitemap)', r.status === 200 && Array.isArray(r.json.data.jobs) && typeof r.json.data.total === 'number');
ok('public list excludes drafts', !r.json.data.jobs.some((j) => j.title.includes('Bad')));
r = await call('GET', '/jobs?isActive=false');
ok('isActive=false parsed as boolean false (was truthy bug)', r.status === 200 && r.json.data.jobs.length === 0, r.json.data.jobs.length);
r = await call('GET', '/jobs/latest?limit=5');
ok('latest', r.status === 200 && r.json.data.length === 5);
r = await call('GET', '/jobs/by-type/result');
ok('by-type returns array', r.status === 200 && Array.isArray(r.json.data) && r.json.data.length >= 1);
r = await call('GET', '/jobs/search?q=ssc');
ok('search finds SSC posts', r.status === 200 && r.json.data.length >= 2);
r = await call('GET', '/jobs/search?q=' + encodeURIComponent('.*(('));
ok('regex metacharacters in search are safe → 200', r.status === 200, r.status);
r = await call('GET', '/jobs/home');
ok('home aggregate has sections + bulletins', r.status === 200 && r.json.data.sections.length >= 5 && Array.isArray(r.json.data.bulletins), JSON.stringify(r.json).slice(0, 120));
r = await call('GET', '/jobs/facets');
ok('facets', r.status === 200 && Array.isArray(r.json.data.states));
r = await call('GET', '/jobs/sitemap');
ok('sitemap feed', r.status === 200 && r.json.data.length >= 11);
r = await call('GET', `/jobs/${x.slug}/related`);
ok('related', r.status === 200 && Array.isArray(r.json.data));
r = await call('GET', '/jobs/bulletins');
ok('bulletins (public)', r.status === 200 && Array.isArray(r.json.data));
r = await call('PATCH', `/jobs/bulletins/${x._id}/toggle`, { token: editor.token });
ok('editor toggles bulletin', r.status === 200 && r.json.data.isBulletin === true);
r = await call('PATCH', `/jobs/bulletins/${x._id}/toggle`, { token: viewer.token });
ok('viewer cannot toggle bulletin → 403', r.status === 403);
r = await call('GET', '/jobs/admin/list?status=draft', { token: viewer.token });
ok('admin list shows drafts (viewer may read)', r.status === 200 && r.json.data.jobs.every((j) => j.status === 'draft'));
r = await call('GET', '/jobs/admin/list');
ok('admin list requires auth → 401', r.status === 401);
r = await call('GET', '/jobs/stats', { token: viewer.token });
ok('stats', r.status === 200 && r.json.data.posts.published >= 11, JSON.stringify(r.json).slice(0, 150));

// ── scheduling ───────────────────────────────────────
r = await call('POST', '/jobs', { token: publisher.token, body: { ...form, title: `E2E Scheduled ${run}`, status: 'scheduled', scheduledAt: new Date(Date.now() + 3600e3).toISOString() } });
ok('future schedule accepted', r.status === 201 && r.json.data.status === 'scheduled', JSON.stringify(r.json).slice(0, 160));
r = await call('GET', `/jobs/e2e-scheduled-${run}`);
ok('scheduled post not public yet', r.status === 404);

// ── categories / organizations ───────────────────────
r = await call('GET', '/job-categories/active');
ok('categories active (public)', r.status === 200 && r.json.data.length >= 11);
const cats = r.json.data;
const adm = cats.find((c) => c.slug === 'admit-card');
r = await call('PATCH', `/job-categories/${adm._id}/reorder`, { token: admin.token, body: { newSequence: 1 } });
ok('reorder moves to position 1', r.status === 200 && r.json.data[0].slug === 'admit-card');
r = await call('DELETE', `/job-categories/${adm._id}`, { token: admin.token });
ok('delete category that has posts → 409 (was orphaning posts)', r.status === 409, r.status);
r = await call('PATCH', `/job-categories/${adm._id}`, { token: admin.token, body: { slug: 'admit-cards' } });
ok('rename category slug with posts → 409', r.status === 409, r.status);
r = await call('POST', '/organizations', { token: publisher.token, body: { name: `E2E Board ${run}`, slug: '', description: '', isActive: true } });
ok('create org (form-style empty slug)', r.status === 201 && r.json.data.slug === `e2e-board-${run}`, JSON.stringify(r.json).slice(0, 200));
const org = r.json.data;
r = await call('GET', '/organizations/active');
ok('orgs active (public)', r.status === 200 && r.json.data.length >= 1);
r = await call('POST', '/jobs', { token: admin.token, body: { ...form, title: `E2E OrgPost ${run}`, organizationId: org._id } });
ok('post takes org name from organizationId', r.status === 201 && r.json.data.organization === `E2E Board ${run}`, JSON.stringify(r.json).slice(0, 160));
r = await call('DELETE', `/organizations/${org._id}`, { token: admin.token });
ok('delete org that has posts → 409', r.status === 409);
r = await call('PATCH', `/organizations/${org._id}`, { token: publisher.token, body: { name: `E2E Board Renamed ${run}` } });
r = await call('GET', `/jobs/admin/list?search=OrgPost`, { token: admin.token });
ok('org rename propagates to posts', r.json.data.jobs[0]?.organization === `E2E Board Renamed ${run}`, JSON.stringify(r.json.data.jobs[0]));

// ── contact / faq / redirect links ───────────────────
r = await call('POST', '/contact', { body: { name: 'Ravi', email: 'ravi@x.com', subject: 'Hello', message: 'This is a test message.' } });
ok('public contact form → 201', r.status === 201);
r = await call('GET', '/contact');
ok('contact list requires auth', r.status === 401);
r = await call('GET', '/contact', { token: editor.token });
ok('editor can read contact queries', r.status === 200);
r = await call('GET', '/faqs/public');
ok('faqs/public stays public', r.status === 200 && Array.isArray(r.json.data));
r = await call('POST', '/faqs', { body: { question: 'anon question?', answer: 'anon answer' } });
ok('anonymous faq create → 401', r.status === 401);
r = await call('GET', '/redirect-links?type=RESULT&pageSize=100');
ok('redirect-links list stays public (homepage depends on it)', r.status === 200 && 'links' in r.json.data, JSON.stringify(r.json).slice(0, 120));
r = await call('POST', '/redirect-links', { body: { type: 'RESULT', redirectType: 'external' } });
ok('anonymous redirect-link create → 401', r.status === 401);

// ── batched counters ─────────────────────────────────
const idForViews = (await call('GET', `/jobs/id/${x._id}`, { token: admin.token })).json.data;
const before = idForViews.views;
for (let i = 0; i < 5; i++) await call('POST', `/jobs/id/${x._id}/view`);
await new Promise((res) => setTimeout(res, 16_500));
const after = (await call('GET', `/jobs/id/${x._id}`, { token: admin.token })).json.data.views;
ok('batched view counter flushed (+5)', after - before === 5, `${before} → ${after}`);

// ── rate limit ───────────────────────────────────────
let limited = false;
for (let i = 0; i < 14; i++) {
  const l = await call('POST', '/auth/login', { body: { email: 'nobody@x.com', password: 'nope-nope-nope' } });
  if (l.status === 429) { limited = true; break; }
}
ok('login brute-force is rate limited (429)', limited);

// ── cleanup: leave the database as we found it (safe on a shared dev DB) ──
for (;;) {
  const l = await call('GET', '/jobs/admin/list?limit=100&search=E2E', { token: admin.token });
  const posts = (l.json?.data?.jobs ?? []).filter((j) => /^e2e-|^sched-past/.test(j.slug) || /^E2E /.test(j.title) || j.title === 'Sched past');
  if (!posts.length) break;
  for (const p of posts) await call('DELETE', `/jobs/id/${p._id}`, { token: admin.token });
}
for (const o of (await call('GET', '/organizations', { token: admin.token })).json?.data ?? []) {
  if (/^E2E /.test(o.name)) await call('DELETE', `/organizations/${o._id}`, { token: admin.token });
}
for (const q of (await call('GET', '/contact', { token: admin.token })).json?.data ?? []) {
  if (q.email === 'ravi@x.com') await call('DELETE', `/contact/${q._id}`, { token: admin.token });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
