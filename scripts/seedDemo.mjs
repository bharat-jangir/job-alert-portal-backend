#!/usr/bin/env node
/**
 * Demo data for local testing, created through the real HTTP API (so validation,
 * slug generation, permissions and cache/revalidate hooks all run as in production).
 *
 *   npm run seed:demo           create demo data (safe to re-run; existing items are skipped)
 *   npm run seed:demo -- --clean  remove everything this script created
 *
 * Needs the backend running and the admin user from `npm run seed:admin`.
 * Env: API_BASE (default http://localhost:5000/api), ADMIN_EMAIL, ADMIN_PASSWORD
 * Everything is tagged "demo" (posts), "[demo]" (descriptions) or demo+...@example.com (queries).
 */
const BASE = (process.env.API_BASE || 'http://localhost:5000/api').replace(/\/$/, '');
const EMAIL = process.env.ADMIN_EMAIL || 'admin@rojgarresult.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123';
const CLEAN = process.argv.includes('--clean');

let token = '';
async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  // responses are wrapped as { data, meta } by the global interceptor
  if (data && typeof data === 'object' && 'meta' in data && 'data' in data) data = data.data;
  return { status: res.status, data };
}
const must = (r, what) => {
  if (r.status >= 400) throw new Error(`${what} -> ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
  return r.data;
};
const day = 86_400_000;
const at = (d) => new Date(Date.now() + d * day).toISOString();

// ---------------------------------------------------------------- data
const ORGS = [
  ['Staff Selection Commission', 'SSC'], ['Union Public Service Commission', 'UPSC'],
  ['Railway Recruitment Board', 'RRB'], ['Institute of Banking Personnel Selection', 'IBPS'],
  ['State Bank of India', 'SBI'], ['Rajasthan Public Service Commission', 'RPSC'],
  ['Uttar Pradesh Police Recruitment Board', 'UP Police'], ['Indian Army', 'Army'],
];

const FAQS = [
  ['How do I apply for a government job online?', 'Open the official notification, register on the recruiting body website, fill the form, upload documents and pay the fee.'],
  ['Is this website an official government site?', 'No. We publish updates collected from official notifications. Always confirm on the official website.'],
  ['How often are new vacancies added?', 'New notifications are added every day, usually within a few hours of release.'],
  ['What documents are needed for an online form?', 'Photo, signature, ID proof, education certificates and category certificate if applicable.'],
  ['Can I get job alerts?', 'Bookmark the latest jobs page. Email and push alerts are planned.'],
];

const TYPES = {
  job: ['Recruitment 2026 Notification Out for {n} Posts', 'Vacancy 2026 Apply Online for {n} Posts'],
  'online-form': ['Online Form 2026 for {n} Posts', 'Apply Online 2026 Last Date Extended'],
  result: ['Final Result 2026 Declared', 'Merit List 2026 Out'],
  'admit-card': ['Admit Card 2026 Download', 'Hall Ticket 2026 Released'],
  'answer-key': ['Answer Key 2026 Out', 'Provisional Answer Key 2026'],
  admission: ['Admission 2026 Apply Online', 'Counselling 2026 Registration'],
  syllabus: ['Syllabus 2026 and Exam Pattern', 'Syllabus 2026 PDF Download'],
  upcoming: ['Upcoming Vacancy 2026 Expected', 'Notification 2026 Soon'],
  verification: ['Document Verification 2026 Date Out', 'DV Schedule 2026'],
  'sarkari-yojana': ['Yojana 2026 Apply Online', 'Scheme 2026 Registration'],
  update: ['Important Update 2026', 'Notice Regarding Exam Date 2026'],
};
const RT = { job: 'JOB', result: 'RESULT', 'answer-key': 'ANSWERKEY', admission: 'ADMISSION', 'admit-card': 'ADMITCARD',
  'online-form': 'ONLINEFORM', update: 'UPDATE', syllabus: 'SYLLABUS', upcoming: 'UPCOMING', verification: 'VERIFICATION',
  'sarkari-yojana': 'SARKARIYOJANA' };
const QUALS = ['HIGH_SCHOOL', 'BACHELORS', 'MASTERS', 'OTHER'];
const STATES = ['Rajasthan', 'Uttar Pradesh', 'Bihar', 'Madhya Pradesh', 'Delhi'];

function sectionsFor(title, org, type) {
  const s = [
    { type: 'callout', tone: 'info', text: `This is demo content for testing. ${org} — ${title}.` },
    { type: 'heading', level: 2, text: 'Overview' },
    { type: 'paragraph', text: `${org} has released the notification. Candidates should read the official notice carefully before applying.` },
    { type: 'table', title: 'Important dates', headers: ['Event', 'Date'], rows: [['Start', '01 Jan 2026'], ['Last date', '31 Jan 2026'], ['Exam', 'March 2026']] },
    { type: 'list', title: 'Eligibility', ordered: false, items: ['Indian citizen', 'Age 18 to 32 years', 'Relevant qualification'] },
  ];
  if (['job', 'online-form', 'admission', 'sarkari-yojana'].includes(type)) {
    s.push({ type: 'steps', title: 'How to apply', items: ['Open the official website', 'Register with email and mobile', 'Fill the form', 'Upload documents', 'Pay fee and submit'] });
  }
  s.push({ type: 'links', title: 'Useful links', items: [{ label: 'Official website', url: 'https://example.com' }, { label: 'Notification PDF', url: 'https://example.com/notice.pdf' }] });
  s.push({ type: 'faq', title: 'FAQs', items: [{ question: 'What is the last date?', answer: 'See the important dates table above.' }, { question: 'Is there an application fee?', answer: 'Yes, fee varies by category.' }] });
  return s;
}


// ---------------------------------------------------------------- flagship complex post
const COMPLEX_TITLE = 'DEMO RRB Group D 2026 Mega Recruitment – 32,438 Posts (Zone, Post and Category Wise)';

function complexSections() {
  const cats = ['UR', 'OBC', 'SC', 'ST', 'EWS'];
  const posts = [
    ['Track Maintainer Grade IV', 'Engineering', 'Level 1'], ['Assistant Pointsman', 'Traffic', 'Level 1'],
    ['Hospital Assistant', 'Medical', 'Level 1'], ['Helper/Assistant (Electrical)', 'Electrical', 'Level 1'],
    ['Helper/Assistant (Mechanical)', 'Mechanical', 'Level 1'], ['Helper/Assistant (S&T)', 'Signal & Telecom', 'Level 1'],
    ['Assistant (Workshop)', 'Mechanical', 'Level 1'], ['Assistant Loco Shed (Diesel)', 'Mechanical', 'Level 1'],
    ['Assistant Loco Shed (Electrical)', 'Electrical', 'Level 1'], ['Assistant Operations (Electrical)', 'Electrical', 'Level 1'],
    ['Assistant TL & AC', 'Electrical', 'Level 1'], ['Assistant TRD', 'Electrical', 'Level 1'],
    ['Assistant C&W', 'Mechanical', 'Level 1'], ['Assistant Bridge', 'Engineering', 'Level 1'],
    ['Assistant P-Way', 'Engineering', 'Level 1'], ['Assistant Station Master (Trainee)', 'Traffic', 'Level 2'],
    ['Junior Engineer (Civil)', 'Engineering', 'Level 6'], ['Junior Engineer (Electrical)', 'Electrical', 'Level 6'],
    ['Depot Material Superintendent', 'Stores', 'Level 6'], ['Chemical & Metallurgical Assistant', 'Laboratory', 'Level 5'],
  ];
  const postRows = posts.map(([name, dept, level], i) => {
    const per = [900 + i * 31, 480 + i * 17, 250 + i * 9, 120 + i * 5, 90 + i * 4];
    return [String(i + 1), name, dept, level, ...per.map(String), String(per.reduce((a, b) => a + b, 0))];
  });
  const zones = ['Central (CR)', 'Eastern (ER)', 'East Central (ECR)', 'East Coast (ECoR)', 'Northern (NR)', 'North Central (NCR)',
    'North Eastern (NER)', 'Northeast Frontier (NFR)', 'North Western (NWR)', 'Southern (SR)', 'South Central (SCR)',
    'South Eastern (SER)', 'South East Central (SECR)', 'South Western (SWR)', 'Western (WR)', 'West Central (WCR)'];
  const zoneRows = zones.map((z, i) => [String(i + 1), z, `RRB ${z.split(' ')[0]}`, String(1200 + i * 97), i % 3 === 0 ? 'Yes' : 'No']);

  return [
    { type: 'callout', tone: 'warning', text: 'DEMO CONTENT — numbers are made up to test the system. Always verify dates and vacancies on the official notice.' },
    { type: 'heading', level: 2, text: 'RRB Group D 2026 – Overview' },
    { type: 'paragraph', text: 'The Railway Recruitment Boards have released the Group D notification for track maintainers, pointsmen, helpers and assistants.\nThe recruitment is held in four stages: CBT, Physical Efficiency Test, Document Verification and Medical Examination.\n\nRead every section of this page before you apply. A wrong category or zone choice cannot be changed later.' },
    { type: 'table', title: 'Recruitment at a glance', headers: ['Detail', 'Information'], rows: [
      ['Conducting body', 'Railway Recruitment Boards (RRB) & Railway Recruitment Cells (RRC)'],
      ['Total vacancies', '32,438'], ['Pay scale', '₹18,000 – ₹56,900 (Level 1 to Level 6)'],
      ['Application mode', 'Online only'], ['Job location', 'All India (zone-wise)'],
      ['Special characters test', 'A & B < C > D "quoted" \'single\' ₹ © — – …'],
      ['Markup is shown as text', '<b>not bold</b> <script>alert(1)</script>'] ] },
    { type: 'heading', level: 2, text: 'Post-wise and category-wise vacancy' },
    { type: 'paragraph', text: 'The table below has 20 rows and 10 columns to check scrolling and layout on small screens.' },
    { type: 'table', title: 'Post-wise vacancy details', headers: ['#', 'Post name', 'Department', 'Pay level', ...cats, 'Total'], rows: postRows },
    { type: 'heading', level: 3, text: 'Zone-wise vacancy' },
    { type: 'table', title: 'Zone-wise vacancy details', headers: ['#', 'Railway zone', 'Recruiting board', 'Vacancies', 'Women preference'], rows: zoneRows },
    { type: 'heading', level: 2, text: 'Eligibility criteria' },
    { type: 'heading', level: 3, text: 'Educational qualification' },
    { type: 'list', ordered: true, items: ['Class 10 pass / ITI from a recognised board, or NCVT National Apprenticeship Certificate', 'For Level 2 posts: 12th pass with the stated stream', 'For Level 6 posts: diploma or engineering degree in the listed branch', 'Final-year students may apply only if the result is out before document verification'] },
    { type: 'heading', level: 3, text: 'Age limit (as on 01 Jan 2027)' },
    { type: 'table', headers: ['Category', 'Minimum', 'Maximum', 'Relaxation'], rows: [
      ['General / UR', '18', '33', '—'], ['OBC (non-creamy)', '18', '36', '3 years'], ['SC / ST', '18', '38', '5 years'],
      ['EWS', '18', '33', '—'], ['PwBD (General)', '18', '43', '10 years'], ['Ex-servicemen', '18', '33', '3 years + service'] ] },
    { type: 'list', title: 'Application fee', ordered: false, items: ['General / OBC: ₹500 (₹400 refunded after appearing in CBT)', 'SC / ST / Ex-servicemen / PwBD / Women / Transgender / Minorities / EBC: ₹250 (fully refunded after CBT)', 'Pay online via debit card, credit card, net banking or UPI'] },
    { type: 'callout', tone: 'info', text: 'Keep a scanned photo (20–50 KB) and signature (10–40 KB) ready before you start the form.' },
    { type: 'heading', level: 2, text: 'How to apply online' },
    { type: 'steps', title: 'Step-by-step application', items: [
      'Open the official website of your preferred RRB.', 'Click “Create an Account” and register with a valid email and mobile number.',
      'Verify the email and mobile with the OTP sent to you.', 'Log in and open the Group D application.', 'Fill in personal details exactly as in your certificates.',
      'Choose your preferred zones in order of priority.', 'Upload photo, signature and the required documents.', 'Check the preview page carefully.',
      'Pay the fee and submit the form.', 'Download and save the confirmation page.'] },
    { type: 'heading', level: 2, text: 'Selection process and exam pattern' },
    { type: 'table', title: 'CBT exam pattern', headers: ['Subject', 'Questions', 'Marks', 'Duration'], rows: [
      ['Mathematics', '25', '25', '90 minutes (120 for PwBD)'], ['General Intelligence & Reasoning', '30', '30', ''], ['General Science', '25', '25', ''],
      ['General Awareness & Current Affairs', '20', '20', ''], ['Total', '100', '100', '90 minutes'] ] },
    { type: 'callout', tone: 'success', text: 'There is 1/3 negative marking for every wrong answer. Minimum qualifying marks: UR 40%, OBC/EWS 30%, SC 30%, ST 25%.' },
    { type: 'html', html: '<h2>Preparation video (raw HTML block)</h2><p>This block is plain HTML written by an editor.</p><table><thead><tr><th>Week</th><th>Focus</th></tr></thead><tbody><tr><td>1–2</td><td>Mathematics basics</td></tr><tr><td>3–4</td><td>Reasoning &amp; science</td></tr></tbody></table><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="560" height="315" title="Demo video" allowfullscreen></iframe><script>window.__xss=1</script><img src="x" onerror="window.__xss=2"><iframe src="https://evil.example.com/x"></iframe>' },
    { type: 'links', title: 'Important links', items: [
      { label: 'Apply online (official)', url: 'https://example.com/apply' }, { label: 'Download official notification (PDF)', url: 'https://example.com/notice.pdf' },
      { label: 'Syllabus and exam pattern', url: 'https://example.com/syllabus' }, { label: 'Previous year papers', url: 'https://example.com/papers' },
      { label: 'Zone-wise RRB websites', url: 'https://example.com/rrb-sites' }, { label: 'Join our Telegram channel', url: 'https://t.me/example' } ] },
    { type: 'faq', title: 'RRB Group D 2026 – FAQs', items: [
      { question: 'What is the last date to apply?', answer: 'The last date is shown in the important dates box at the top of this page.' },
      { question: 'Can I apply to more than one RRB?', answer: 'No. A candidate may apply to only one RRB. Multiple applications are cancelled.' },
      { question: 'Is there negative marking?', answer: 'Yes, 1/3 mark is deducted for each wrong answer.' },
      { question: 'What is the minimum qualification?', answer: 'Class 10 pass or ITI / NCVT certificate for most posts.' },
      { question: 'Is the application fee refundable?', answer: 'Yes, after appearing in the CBT. See the fee section for amounts.' },
      { question: 'How many zones can I select?', answer: 'You can mark preferences for all zones in order of priority.' },
      { question: 'Are women eligible?', answer: 'Yes. Women candidates are eligible for all posts, subject to the physical standards.' },
      { question: 'Where can I download the admit card?', answer: 'It will be posted on this site and on the official RRB websites before the exam.' } ] },
  ];
}


// ---------------------------------------------------------------- showcase: every block type
const SHOWCASE_TITLE = 'DEMO All Content Blocks Showcase – Every Block Type In One Post';
const IMG = (n) => `https://picsum.photos/seed/jobalert${n}/800/450`;

function showcaseSections() {
  return [
    { type: 'toc', title: 'In this post' },
    { type: 'heading', level: 2, text: 'Text blocks' },
    { type: 'paragraph', text: 'Inline formatting: **bold**, *italic*, ~~strikethrough~~, `inline code`, an [external link](https://example.com), an [internal link](/jobs) and a [bad link](javascript:alert(1)) that must stay plain text.\nSecond line in the same paragraph.' },
    { type: 'heading', level: 3, text: 'Quotes' },
    { type: 'quote', style: 'quote', text: 'Success is the sum of small efforts, repeated day in and day out.', cite: 'Robert Collier' },
    { type: 'quote', style: 'pull', text: 'Prepare today, shine tomorrow.', cite: 'Demo pull quote' },
    { type: 'heading', level: 3, text: 'Code' },
    { type: 'code', language: 'json', code: '{\n  "post": "<b>escaped</b>",\n  "ok": true\n}' },
    { type: 'list', title: 'Bulleted list with **formatting**', ordered: false, items: ['First **bold** item', 'Second *italic* item', 'Third with a [link](https://example.com)'] },
    { type: 'list', title: 'Numbered list', ordered: true, items: ['One', 'Two', 'Three'] },
    { type: 'heading', level: 2, text: 'Data blocks' },
    { type: 'table', title: 'Aligned table', headers: ['Left', 'Center', 'Right'], align: ['left', 'center', 'right'], rows: [['a', 'b', 'c'], ['**bold**', '*italic*', '`code`'], ['1', '22', '333']] },
    { type: 'keyvalue', title: 'Info card', items: [{ label: 'Organisation', value: 'Demo Board' }, { label: 'Posts', value: '**1,234**' }, { label: 'Website', value: '[example.com](https://example.com)' }] },
    { type: 'timeline', title: 'Timeline', items: [{ date: '01 Jan 2026', title: 'Notification released', text: 'Official notice published.' }, { date: '15 Jan 2026', title: 'Applications open' }, { date: '15 Feb 2026', title: 'Last date', text: 'Apply before **11:59 PM**.' }] },
    { type: 'steps', title: 'Steps', items: ['Open the website', 'Register', 'Fill the **form**', 'Submit'] },
    { type: 'heading', level: 2, text: 'Media blocks' },
    { type: 'image', src: IMG(1), alt: 'Demo landscape photo', caption: 'A single image with a *caption*', width: 800, height: 450, link: 'https://example.com' },
    { type: 'gallery', title: 'Gallery', images: [1, 2, 3, 4, 5, 6].map((n) => ({ src: IMG(10 + n), alt: `Gallery image ${n}`, caption: n % 2 ? `Photo ${n}` : undefined })) },
    { type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Demo YouTube video', caption: 'YouTube watch-URL converted to a privacy-friendly embed' },
    { type: 'video', url: 'https://vimeo.com/76979871', title: 'Demo Vimeo video' },
    { type: 'audio', src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3', title: 'Demo audio clip' },
    { type: 'embed', url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3501.7!2d77.2!3d28.6', title: 'Demo map embed', height: 350, caption: 'Google Maps embed' },
    { type: 'download', label: 'Official notification', url: 'https://example.com/notice.pdf', fileType: 'pdf', size: '2.4 MB' },
    { type: 'heading', level: 2, text: 'Interactive blocks' },
    { type: 'callout', tone: 'info', text: 'Info callout with a [link](https://example.com).' },
    { type: 'callout', tone: 'warning', text: 'Warning callout.' },
    { type: 'callout', tone: 'success', text: 'Success callout.' },
    { type: 'accordion', title: 'Accordion (not FAQ schema)', items: [{ title: 'What is this?', content: 'A generic collapsible section.' }, { title: 'Is it indexed?', content: 'Yes, as normal page text.' }] },
    { type: 'faq', title: 'FAQ (FAQPage schema)', items: [{ question: 'Does the FAQ use **markup**?', answer: 'Yes, but the JSON-LD gets *plain text*.' }, { question: 'How many questions?', answer: 'Two.' }] },
    { type: 'links', title: 'Links', items: [{ label: 'Example', url: 'https://example.com' }, { label: 'Another', url: 'https://example.org' }] },
    { type: 'button', label: 'Primary button', url: 'https://example.com', style: 'primary', align: 'left' },
    { type: 'button', label: 'Outline button', url: 'https://example.com', style: 'outline', align: 'center' },
    { type: 'button', label: 'Dark button', url: 'https://example.com', style: 'secondary', align: 'right' },
    { type: 'heading', level: 2, text: 'Layout blocks' },
    { type: 'ad', slot: 'in-article-1' },
    { type: 'separator', style: 'line' },
    { type: 'columns', columns: [
      { blocks: [{ type: 'heading', level: 3, text: 'Left column' }, { type: 'paragraph', text: 'Text in the **left** column.' }, { type: 'button', label: 'Left action', url: 'https://example.com', style: 'primary', align: 'left' }] },
      { blocks: [{ type: 'heading', level: 3, text: 'Right column' }, { type: 'list', ordered: false, items: ['Item A', 'Item B'] }, { type: 'image', src: IMG(30), alt: 'Column image' }] },
    ] },
    { type: 'separator', style: 'dots' },
    { type: 'separator', style: 'space' },
    { type: 'heading', level: 2, text: 'Advanced' },
    { type: 'html', html: '<p>Custom HTML block with <strong>markup</strong>.</p><script>window.__xss=1</script>' },
  ];
}

// ---------------------------------------------------------------- clean
async function clean() {
  let removed = 0;
  // posts tagged demo (all statuses)
  for (;;) {
    const r = must(await api('GET', '/jobs/admin/list?limit=100&tag=demo'), 'list posts');
    if (!r.jobs.length) break;
    for (const j of r.jobs) { must(await api('DELETE', `/jobs/id/${j._id}`), 'delete post'); removed++; }
  }
  const orgs = must(await api('GET', '/organizations'), 'orgs');
  for (const o of orgs.filter((o) => (o.description || '').startsWith('[demo]'))) {
    const r = await api('DELETE', `/organizations/${o._id}`);
    if (r.status < 400) removed++; else console.log(`  skip org ${o.name}: ${r.status}`);
  }
  const faqs = must(await api('GET', '/faqs?limit=200'), 'faqs');
  for (const f of (faqs.faqs || faqs.items || faqs).filter?.((f) => f.category === 'demo') || []) {
    must(await api('DELETE', `/faqs/${f._id}`), 'delete faq'); removed++;
  }
  const links = must(await api('GET', '/redirect-links?pageSize=1000'), 'links');
  for (const l of links.links) { if ((l.tag || '') === 'demo') { must(await api('DELETE', `/redirect-links/${l._id}`), 'delete link'); removed++; } }
  const q = must(await api('GET', '/contact'), 'queries');
  for (const c of (q.queries || q)) { if (/^demo\+/.test(c.email)) { must(await api('DELETE', `/contact/${c._id}`), 'delete query'); removed++; } }
  console.log(`Removed ${removed} demo records.`);
}

// ---------------------------------------------------------------- seed
async function seed() {
  const created = { orgs: 0, faqs: 0, posts: 0, links: 0, queries: 0 };

  // organizations
  const orgIds = {};
  const existingOrgs = must(await api('GET', '/organizations'), 'orgs');
  for (const [name] of ORGS) {
    const found = existingOrgs.find((o) => o.name === name);
    if (found) { orgIds[name] = found._id; continue; }
    const o = must(await api('POST', '/organizations', { name, description: `[demo] ${name}`, isActive: true }), `org ${name}`);
    orgIds[name] = o._id; created.orgs++;
  }

  // faqs
  const existingFaqs = must(await api('GET', '/faqs?limit=200'), 'faqs');
  const faqList = existingFaqs.faqs || existingFaqs.items || existingFaqs;
  for (const [i, [question, answer]] of FAQS.entries()) {
    if (faqList.some((f) => f.question === question)) continue;
    must(await api('POST', '/faqs', { question, answer, category: 'demo', order: i + 1, isActive: true }), 'faq'); created.faqs++;
  }

  // posts: 3 per category (published) + workflow samples
  const have = new Set(must(await api('GET', '/jobs/admin/list?limit=100&tag=demo'), 'list').jobs.map((j) => j.title));
  const mk = async (type, title, org, extra = {}) => {
    if (have.has(title)) return null;
    const body = {
      title, type, organization: org, organizationId: orgIds[org],
      status: 'published', isActive: true,
      location: 'All India', states: [STATES[Math.floor(Math.random() * STATES.length)]],
      salary: type === 'job' ? '₹25,500 – ₹81,100' : undefined,
      qualification: QUALS[title.length % QUALS.length], experience: 'ENTRY',
      lastDate: at(10 + (title.length % 40)),
      applyLink: 'https://example.com/apply',
      description: `${title}. Demo post for testing the portal.`,
      eligibility: 'Demo eligibility text.', totalVacancy: String(100 + (title.length * 37) % 5000), ageLimit: '18-32 Years',
      importantDates: [{ label: 'Last Date', date: at(15) }, { label: 'Exam Date', date: at(60) }],
      metaTitle: title.slice(0, 110), metaDescription: `${title} — dates, eligibility and how to apply.`,
      tags: ['demo', type, org.split(' ').pop().toLowerCase()],
      sections: sectionsFor(title, org, type),
      ...extra,
    };
    const r = await api('POST', '/jobs', JSON.parse(JSON.stringify(body)));
    must(r, `post "${title}"`); created.posts++;
    return r.data;
  };
  const orgNames = ORGS.map((o) => o[0]);
  const short = Object.fromEntries(ORGS.map(([n, s]) => [n, s]));
  let k = 0;
  const published = [];
  for (const [type, patterns] of Object.entries(TYPES)) {
    for (let i = 0; i < 3; i++) {
      const org = orgNames[k++ % orgNames.length];
      const title = `${short[org]} ${patterns[i % patterns.length].replace('{n}', String(500 + k * 113))}${i > 1 ? ` (Phase ${i})` : ''}`;
      const p = await mk(type, title, org, { isBulletin: i === 0 && k % 2 === 0 });
      if (p) published.push(p);
    }
  }
  // flagship complex post (big tables, nested headings, escaping tests, raw HTML, FAQ)
  if (!have.has(COMPLEX_TITLE)) {
    await mk('job', COMPLEX_TITLE, 'Railway Recruitment Board', {
      isBulletin: true, qualification: 'HIGH_SCHOOL', totalVacancy: '32,438', ageLimit: '18-33 Years',
      salary: '₹18,000 – ₹56,900', location: 'All India (zone-wise)', states: STATES,
      description: 'RRB Group D 2026: 32,438 vacancies across 16 zones. Post-wise and category-wise vacancy, eligibility, fee, exam pattern and how to apply.',
      updateNote: 'Zone-wise vacancy table added',
      importantDates: [
        { label: 'Notification date', date: at(-12) }, { label: 'Online application starts', date: at(-10) },
        { label: 'Last date to apply', date: at(20) }, { label: 'Last date to pay fee', date: at(22) },
        { label: 'Correction window', date: at(25) }, { label: 'CBT admit card', date: at(55) },
        { label: 'CBT exam date', date: at(65) }, { label: 'Result', date: at(100) } ],
      attachments: [{ name: 'Official notification', url: 'https://example.com/notice.pdf' }, { name: 'Syllabus PDF', url: 'https://example.com/syllabus.pdf' }],
      tags: ['demo', 'job', 'rrb', 'railway', 'group-d', 'complex'],
      metaTitle: 'RRB Group D 2026: 32,438 Posts – Apply Online, Vacancy, Eligibility',
      sections: complexSections(),
    });
  }
  // showcase post: every block type, to prove the whole content model works end to end
  if (!have.has(SHOWCASE_TITLE)) {
    await mk('update', SHOWCASE_TITLE, 'Staff Selection Commission', {
      description: 'Demo post containing every supported content block.',
      tags: ['demo', 'update', 'showcase'], sections: showcaseSections(), lastDate: undefined,
      applyLink: undefined, importantDates: undefined, qualification: undefined,
    });
  }
  // workflow samples
  await mk('job', 'DEMO Draft Post Not Visible To Public', 'Indian Army', { status: 'draft' });
  await mk('result', 'DEMO In Review Post Waiting For Publisher', 'State Bank of India', { status: 'review' });
  await mk('job', 'DEMO Scheduled Post Goes Live Tomorrow', 'Railway Recruitment Board', { status: 'scheduled', scheduledAt: at(1) });
  await mk('update', 'DEMO Archived Post Hidden From Public', 'Union Public Service Commission', { status: 'archived' });
  // legacy html-only post (no sections)
  await mk('job', 'DEMO Legacy HTML Only Post', 'Indian Army', { sections: undefined, htmlContent: '<h2>Legacy content</h2><p>This post only has HTML.</p><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>' });

  // slug history sample: create then rename
  const renameTitle = 'DEMO Slug Rename Sample Original';
  if (!have.has(renameTitle)) {
    const p = await mk('job', renameTitle, 'Staff Selection Commission', {});
    if (p) must(await api('PATCH', `/jobs/id/${p._id}`, { slug: 'demo-slug-rename-sample-new', revisionNote: 'renamed slug' }), 'rename');
  }

  // redirect links (the public home reads these) for published demo posts
  const all = must(await api('GET', '/jobs/admin/list?limit=100&tag=demo&status=published'), 'list').jobs;
  const links = must(await api('GET', '/redirect-links?pageSize=1000'), 'links').links;
  for (const j of all) {
    if (!RT[j.type] || links.some((l) => l.slug === j.slug && l.tag === 'demo')) continue;
    const r = await api('POST', '/redirect-links', { type: RT[j.type], slug: j.slug, title: j.title, redirectType: 'internal', tag: 'demo', isActive: true });
    must(r, 'redirect link'); created.links++;
  }

  // contact queries
  const queries = must(await api('GET', '/contact'), 'queries');
  const qlist = queries.queries || queries;
  for (const [i, subject] of ['Wrong date in a post', 'Please add RRB NTPC', 'Advertise with us'].entries()) {
    if (qlist.some((q) => q.subject === subject && /^demo\+/.test(q.email))) continue;
    must(await api('POST', '/contact', { name: `Demo User ${i + 1}`, email: `demo+${i + 1}@example.com`, subject, message: 'This is a demo contact message for testing the admin queries screen.' }), 'contact');
    created.queries++;
  }
  console.log('Created:', created);
}

(async () => {
  try { await fetch(BASE + '/health'); } catch {
    throw new Error(`Cannot reach the API at ${BASE}. Start the backend first (npm run start:dev), or set API_BASE.`);
  }
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  token = login.data?.access_token || login.data?.accessToken || login.data?.token;
  if (!token) throw new Error(`Login failed (${login.status}). Run "npm run seed:admin" first. ${JSON.stringify(login.data)}`);
  await (CLEAN ? clean() : seed());
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
