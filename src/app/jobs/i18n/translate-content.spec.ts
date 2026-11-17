import {
  batchStrings, extractTranslatable, isTranslatable, preservesFacts, reconcile, toAsciiDigits, translationAcceptable,
} from './translate-content';

const sections = [
  { type: 'heading', level: 2, text: 'Application Fee Details' },
  { type: 'table', title: 'Fee', headers: ['Category', 'Fee'], rows: [['General', '500'], ['SC / ST', '250']], styles: { color: '#fff' } },
  { type: 'links', title: 'Important Links', items: [{ label: 'Apply Online', url: 'https://example.gov.in/apply' }] },
  { type: 'steps', items: ['Open the official website', 'Fill the form'] },
  { type: 'html', html: '<p>Raw html stays English</p>' },
  { type: 'columns', columns: [{ blocks: [{ type: 'paragraph', text: 'Inside a column' }] }, { blocks: [] }] },
];

describe('extractTranslatable', () => {
  it('collects readable text and leaves urls, types, styles and html alone', () => {
    const { strings } = extractTranslatable(sections);
    expect(strings).toEqual(expect.arrayContaining([
      'Application Fee Details', 'Category', 'Fee', 'General', 'SC / ST', 'Important Links', 'Apply Online',
      'Open the official website', 'Fill the form', 'Inside a column',
    ]));
    expect(strings.join('|')).not.toMatch(/https:|Raw html|#fff|heading|table/);
    // pure numbers are not worth sending
    expect(strings).not.toContain('500');
  });

  it('deduplicates repeated strings', () => {
    const { strings } = extractTranslatable([{ type: 'paragraph', text: 'Same' }, { type: 'paragraph', text: 'Same' }]);
    expect(strings).toEqual(['Same']);
  });

  it('rebuilds the exact same structure with translated text and does not mutate the input', () => {
    const snapshot = JSON.stringify(sections);
    const { strings, rebuild } = extractTranslatable(sections);
    const out = rebuild(strings.map((s) => `HI(${s})`));
    expect(JSON.stringify(sections)).toBe(snapshot);

    expect(out).toHaveLength(sections.length);
    expect(out.map((b: any) => b.type)).toEqual(sections.map((b) => b.type));
    expect(out[0]).toEqual({ type: 'heading', level: 2, text: 'HI(Application Fee Details)' });
    expect(out[1].rows).toEqual([['HI(General)', '500'], ['HI(SC / ST)', '250']]); // numbers untouched
    expect(out[1].styles).toEqual({ color: '#fff' });
    expect(out[2].items[0]).toEqual({ label: 'HI(Apply Online)', url: 'https://example.gov.in/apply' });
    expect(out[4]).toEqual(sections[4]);
    expect(out[5].columns[0].blocks[0].text).toBe('HI(Inside a column)');
  });

  it('works on a wrapper of post fields too', () => {
    const { strings, rebuild } = extractTranslatable({ title: 'RRB Group D 2026', importantDateLabels: ['Start Date', ''], location: 'All India' });
    expect(strings).toEqual(['RRB Group D 2026', 'Start Date', 'All India']);
    expect(rebuild(['A', 'B', 'C'])).toEqual({ title: 'A', importantDateLabels: ['B', ''], location: 'C' });
  });
});

describe('isTranslatable', () => {
  it.each([['Apply Online', true], ['500', false], ['12/03/2026', false], ['https://x.gov.in/a', false], ['a@b.gov.in', false], ['', false], ['SSC', true]])(
    '%s -> %s', (s, ok) => expect(isTranslatable(s)).toBe(ok));
});

describe('preservesFacts', () => {
  it('accepts a faithful translation', () => {
    expect(preservesFacts('Last date is 20 November 2026, fee Rs. 1,000', 'अंतिम तिथि 20 नवंबर 2026 है, शुल्क Rs. 1000')).toBe(true);
  });
  it('rejects a changed number, a dropped link or a broken tag', () => {
    expect(preservesFacts('Vacancies: 32438', 'रिक्तियां: 32348')).toBe(false);
    expect(preservesFacts('Visit https://rrb.gov.in now', 'अभी देखें')).toBe(false);
    expect(preservesFacts('<b>Note</b> 5 posts', '<b>ध्यान दें 5 पद')).toBe(false);
    expect(preservesFacts('Hello', '   ')).toBe(false);
  });
  it('treats Devanagari digits as the same number', () => {
    expect(preservesFacts('Posts: 2026', 'पद: २०२६')).toBe(true);
    expect(toAsciiDigits('२०२६-०७')).toBe('2026-07');
  });
});

describe('reconcile', () => {
  const src = ['Apply online before the last date', 'Fee 500 for General', 'SSC'];

  it('keeps good translations, ASCII-fies digits and reverts the ones that changed a number', () => {
    const r = reconcile(src, ['अंतिम तिथि से पहले ऑनलाइन आवेदन करें', 'सामान्य के लिए शुल्क ६००', 'SSC']);
    expect(r.result).toEqual(['अंतिम तिथि से पहले ऑनलाइन आवेदन करें', 'Fee 500 for General', 'SSC']);
    expect(r.reverted).toBe(1);
  });

  it('counts a sentence returned still in English as untranslated', () => {
    const r = reconcile(['Apply online before the last date'], ['Apply online before the last date']);
    expect(r.translatedRatio).toBe(0);
  });

  it('handles missing answers', () => {
    const r = reconcile(src, [undefined, undefined, undefined]);
    expect(r.result).toEqual(src);
    expect(r.reverted).toBe(3);
  });
});

describe('translationAcceptable', () => {
  it('needs mostly-Hindi sentences and few reverts', () => {
    expect(translationAcceptable(10, { result: [], reverted: 1, translatedRatio: 0.95 })).toBe(true);
    expect(translationAcceptable(10, { result: [], reverted: 1, translatedRatio: 0.4 })).toBe(false);
    expect(translationAcceptable(10, { result: [], reverted: 5, translatedRatio: 0.95 })).toBe(false);
    expect(translationAcceptable(0, { result: [], reverted: 0, translatedRatio: 1 })).toBe(false);
  });
});

describe('batchStrings', () => {
  it('splits by count and by characters, preserving every index once', () => {
    const strings = Array.from({ length: 250 }, (_, i) => `string ${i}`);
    const batches = batchStrings(strings, 100, 1_000_000);
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(batches.flat()).toEqual(strings.map((_, i) => i));
    expect(batchStrings(['a'.repeat(60), 'b'.repeat(60), 'c'.repeat(60)], 100, 100)).toEqual([[0], [1], [2]]);
  });
});
