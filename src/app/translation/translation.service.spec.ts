import { BadRequestException } from '@nestjs/common';
import { TranslationService } from './translation.service';

const svc = () => new TranslationService({ get: () => undefined } as any);

const post = {
  title: 'RRB Group D Recruitment 2026 for 32438 Posts',
  description: 'Apply online before the last date to join Indian Railways.',
  organization: 'Railway Recruitment Board',
  importantDates: [{ label: 'Application Start Date', date: '2026-12-01' }],
  sections: [
    { type: 'heading', level: 2, text: 'Application Fee Details' },
    { type: 'table', headers: ['Category', 'Fee'], rows: [['General Category', '500'], ['SC or ST Category', '250']] },
    { type: 'links', items: [{ label: 'Apply Online', url: 'https://rrb.gov.in/apply' }] },
  ],
};

/** A fake translator: prefixes every string with a Devanagari marker (a "good" translation). */
const goodTranslator = (strings: string[]) => strings.map((s) => `अनुवाद: ${s}`);

describe('TranslationService.translatePost', () => {
  it('translates text, keeps structure, links and numbers, and marks it machine', async () => {
    const s = svc();
    jest.spyOn(s, 'translateStrings').mockImplementation(async (strings) => goodTranslator(strings));
    const r = await s.translatePost(post);

    expect(r.acceptable).toBe(true);
    expect(r.translation.status).toBe('machine');
    expect(r.translation.translatedAt).toBeInstanceOf(Date);
    expect(r.translation.title).toContain('अनुवाद');
    expect(r.translation.title).toContain('32438'); // number preserved
    expect(r.translation.importantDateLabels?.[0]).toContain('अनुवाद');
    const sec: any[] = r.translation.sections as any[];
    expect(sec.map((b) => b.type)).toEqual(['heading', 'table', 'links']);
    expect(sec[1].rows[0][1]).toBe('500');
    expect(sec[2].items[0].url).toBe('https://rrb.gov.in/apply');
  });

  it('keeps the English text for a string whose number was changed by the model', async () => {
    const s = svc();
    jest.spyOn(s, 'translateStrings').mockImplementation(async (strings) =>
      strings.map((x) => (x.includes('32438') ? 'अनुवाद: 32000 पदों के लिए भर्ती' : `अनुवाद: ${x}`)));
    const r = await s.translatePost(post);
    expect(r.translation.title).toBe(post.title); // reverted, not a wrong vacancy number
    expect(r.stats.reverted).toBe(1);
    expect(r.translation.description).toContain('अनुवाद');
  });

  it('is not acceptable when the model hands the English text back', async () => {
    const s = svc();
    jest.spyOn(s, 'translateStrings').mockImplementation(async (strings) => strings);
    const r = await s.translatePost(post);
    expect(r.acceptable).toBe(false);
  });

  it('is not acceptable when the model answers nothing', async () => {
    const s = svc();
    jest.spyOn(s, 'translateStrings').mockImplementation(async (strings) => strings.map(() => undefined));
    const r = await s.translatePost(post);
    expect(r.acceptable).toBe(false);
    expect(r.translation.title).toBe(post.title);
  });

  it('rejects a post without a title and one with nothing to translate', async () => {
    const s = svc();
    await expect(s.translatePost({})).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.translatePost({ title: '2026' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports unavailable without an API key', () => {
    expect(svc().available).toBe(false);
  });
});
