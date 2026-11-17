import {
  availableLanguages, cardTranslationSelect, hasTranslation, listTranslationExclusion, localizeCard, localizePost,
  normalizeLang, PostTranslationSchema, TranslationsSchema,
} from './languages';

const post = {
  _id: 'p1', slug: 'rrb-group-d', title: 'RRB Group D 2026', description: 'English desc', organization: 'RRB',
  location: 'All India', lastDate: '2026-12-01', importantDates: [{ label: 'Start', date: 'a' }, { label: 'End', date: 'b' }],
  sections: [{ type: 'paragraph', text: 'English body' }],
  translations: {
    hi: {
      title: 'आरआरबी ग्रुप डी 2026', description: 'हिंदी विवरण', importantDateLabels: ['शुरू'],
      sections: [{ type: 'paragraph', text: 'हिंदी पाठ' }], status: 'machine',
    },
  },
};

describe('normalizeLang', () => {
  it('defaults to English for anything unknown', () => {
    expect(normalizeLang('hi')).toBe('hi');
    expect(normalizeLang('en')).toBe('en');
    expect(normalizeLang('fr')).toBe('en');
    expect(normalizeLang(undefined)).toBe('en');
    expect(normalizeLang({})).toBe('en');
  });
});

describe('localizePost', () => {
  it('lays the translation over English and keeps shared facts', () => {
    const o: any = localizePost(post, 'hi');
    expect(o.title).toBe('आरआरबी ग्रुप डी 2026');
    expect(o.description).toBe('हिंदी विवरण');
    expect(o.organization).toBe('RRB'); // no Hindi value: falls back
    expect(o.sections[0].text).toBe('हिंदी पाठ');
    expect(o.slug).toBe('rrb-group-d');
    expect(o.lastDate).toBe('2026-12-01');
    expect(o.importantDates).toEqual([{ label: 'शुरू', date: 'a' }, { label: 'End', date: 'b' }]);
    expect(o.language).toBe('hi');
    expect(o.availableLanguages).toEqual(['en', 'hi']);
    expect(o.translationStatus).toBe('machine');
    expect(o.translations).toBeUndefined();
  });

  it('drops the English SEO title/description when the translation has none', () => {
    const o: any = localizePost({ ...post, metaTitle: 'English SEO title', metaDescription: 'English SEO desc' }, 'hi');
    expect(o.metaTitle).toBeUndefined();
    expect(o.metaDescription).toBeUndefined();
    const withMeta: any = localizePost({ ...post, metaTitle: 'English', translations: { hi: { ...post.translations.hi, metaTitle: 'हिंदी शीर्षक' } } }, 'hi');
    expect(withMeta.metaTitle).toBe('हिंदी शीर्षक');
  });

  it('returns English (and says so) when the translation is missing', () => {
    const o: any = localizePost({ ...post, translations: undefined }, 'hi');
    expect(o.title).toBe('RRB Group D 2026');
    expect(o.language).toBe('en');
    expect(o.availableLanguages).toEqual(['en']);
  });

  it('ignores a translation without a title', () => {
    expect(hasTranslation({ translations: { hi: { description: 'x' } } }, 'hi')).toBe(false);
    expect(availableLanguages({ translations: { hi: {} } })).toEqual(['en']);
  });

  it('English requests are untouched but still list the languages that exist', () => {
    const o: any = localizePost(post, 'en');
    expect(o.title).toBe('RRB Group D 2026');
    expect(o.language).toBe('en');
    expect(o.availableLanguages).toEqual(['en', 'hi']);
    expect(o.translations).toBeUndefined();
  });
});

describe('localizeCard', () => {
  it('uses translated card fields and falls back per field', () => {
    const o: any = localizeCard({ title: 'T', organization: 'RRB', translations: { hi: { title: 'शीर्षक' } } }, 'hi');
    expect(o).toEqual({ title: 'शीर्षक', organization: 'RRB' });
  });
  it('never fails on rows without translations and strips the field for English', () => {
    expect(localizeCard({ title: 'T' }, 'hi')).toEqual({ title: 'T' });
    expect(localizeCard({ title: 'T', translations: { hi: { title: 'x' } } }, 'en')).toEqual({ title: 'T' });
  });
});

describe('projections', () => {
  it('selects only light translated fields for lists', () => {
    expect(cardTranslationSelect('en')).toBe('');
    expect(cardTranslationSelect('hi')).toContain('translations.hi.title');
    expect(cardTranslationSelect('hi')).not.toContain('sections');
    expect(listTranslationExclusion('hi')).toContain('-translations.hi.sections');
    expect(listTranslationExclusion('en')).toBe('-translations');
  });
});

describe('schemas', () => {
  it('accepts a partial translation and defaults status to machine', () => {
    const r = PostTranslationSchema.parse({ title: 'शीर्षक' });
    expect(r.status).toBe('machine');
  });
  it('rejects invalid sections and unknown languages', () => {
    expect(PostTranslationSchema.safeParse({ sections: [{ type: 'nope' }] }).success).toBe(false);
    expect(TranslationsSchema.safeParse({ fr: { title: 'x' } }).success).toBe(false);
    expect(TranslationsSchema.safeParse({ hi: { title: 'x', sections: [{ type: 'paragraph', text: 'ok' }] } }).success).toBe(true);
  });
});
