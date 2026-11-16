import { BlockStylesSchema, parseSafeCss } from './block-styles';
import { SectionSchema } from './post-sections.schema';

const ok = (v: any) => expect(BlockStylesSchema.safeParse(v).success).toBe(true);
const bad = (v: any) => expect(BlockStylesSchema.safeParse(v).success).toBe(false);

describe('BlockStyles allowlist', () => {
  it('accepts normal cosmetic styles', () => {
    ok({ textColor: '#1e3a8a', bgColor: 'rgb(240, 253, 244)', borderColor: 'red', borderWidth: '1px', borderStyle: 'solid', borderRadius: '10px',
      padding: '14px 18px', margin: '10px 0 20px 0', fontSize: '1.25rem', fontWeight: 'bold', textAlign: 'center',
      className: 'rounded-lg shadow-md text-center', customCss: 'color: #333; border-left: 4px solid #2563eb; box-shadow: 0 1px 3px rgba(0,0,0,.2)' });
  });
  it.each([
    ['colour with a declaration smuggled in', { textColor: 'red; position: fixed' }],
    ['colour with url()', { bgColor: 'url(https://evil.example/x.png)' }],
    ['length with junk', { padding: '10px; top:0' }],
    ['fontWeight junk', { fontWeight: 'bold; x' }],
    ['className positioning', { className: 'fixed inset-0 z-50' }],
    ['className hidden', { className: 'text-sm hidden' }],
    ['className variant + positioning', { className: 'md:absolute' }],
    ['className arbitrary value', { className: 'w-[9999px]' }],
    ['customCss position', { customCss: 'position: fixed; inset: 0' }],
    ['customCss z-index', { customCss: 'z-index: 99999' }],
    ['customCss display none', { customCss: 'display: none' }],
    ['customCss url()', { customCss: 'background: url(https://evil.example/t.png)' }],
    ['customCss background (not allowlisted)', { customCss: 'background: red' }],
    ['customCss @import', { customCss: 'color: red; @import "x"' }],
    ['customCss !important', { customCss: 'color: red !important' }],
    ['customCss opacity 0', { customCss: 'opacity: 0' }],
    ['customCss font-size 0 trick is allowed by length but not url', { customCss: 'color: var(--x)' }],
  ])('rejects %s', (_n, v) => bad(v));

  it('parseSafeCss separates safe and rejected declarations', () => {
    const r = parseSafeCss('color: red; position: fixed; margin: 4px; background: url(x)');
    expect(r.clean).toEqual({ color: 'red', margin: '4px' });
    expect(r.rejected).toEqual(['position', 'background']);
  });
  it('a block with unsafe styles fails the section schema', () => {
    expect(SectionSchema.safeParse({ type: 'paragraph', text: 'x', styles: { customCss: 'position: fixed' } }).success).toBe(false);
    expect(SectionSchema.safeParse({ type: 'paragraph', text: 'x', styles: { textColor: '#fff' } }).success).toBe(true);
  });
});
