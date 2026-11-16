import { z } from 'zod';

/**
 * Per-block styling. Everything is allowlisted: values are validated against strict patterns and
 * `customCss` may only use cosmetic properties. This is not about stopping script execution
 * (React applies styles as properties); it stops page defacement/overlays (position:fixed…),
 * hidden SEO text, and tracking via url().
 */
const COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([0-9\s.,%/-]+\)|[a-z]{3,25})$/i;
const LEN = '-?\\d+(\\.\\d+)?(px|rem|em|%)?|auto';
const LENGTHS = new RegExp(`^(${LEN})(\\s+(${LEN})){0,3}$`, 'i');
const WEIGHT = /^(normal|bold|bolder|lighter|[1-9]00)$/;

/** Cosmetic CSS properties editors may use in customCss. */
export const ALLOWED_CSS_PROPS = new Set([
  'color', 'background-color', 'border', 'border-color', 'border-width', 'border-style', 'border-radius',
  'border-top', 'border-bottom', 'border-left', 'border-right',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
  'text-align', 'text-decoration', 'text-transform', 'box-shadow', 'max-width',
]);

const BAD_VALUE = /url\s*\(|@|\\|expression|javascript|<|\/\*|!important|var\s*\(|attr\s*\(|image-set/i;

/** Parses "prop: value; prop2: value2" into safe declarations; `rejected` lists anything dropped. */
export function parseSafeCss(css: string): { clean: Record<string, string>; rejected: string[] } {
  const clean: Record<string, string> = {};
  const rejected: string[] = [];
  for (const decl of css.split(';').map((d) => d.trim()).filter(Boolean)) {
    const i = decl.indexOf(':');
    if (i < 1) { rejected.push(decl); continue; }
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (!ALLOWED_CSS_PROPS.has(prop) || !val || val.length > 120 || BAD_VALUE.test(val)) { rejected.push(prop); continue; }
    clean[prop] = val;
  }
  return { clean, rejected };
}

/** Tailwind-ish class tokens. Positioning/visibility utilities and arbitrary values are refused. */
const CLASS_TOKEN = /^[a-z0-9:_/.\-%#]+$/i;
const FORBIDDEN_CLASS = /(^|:)(fixed|absolute|sticky|inset|top-|bottom-|left-|right-|z-|hidden|invisible|collapse|sr-only|opacity-0|pointer-events|-translate|translate|-m[trblxy]?-|overflow-hidden|h-0|w-0|max-h-0|max-w-0|text-transparent|float-|content-)/i;

export const BlockStylesSchema = z.object({
  textColor: z.string().regex(COLOR).optional(),
  bgColor: z.string().regex(COLOR).optional(),
  borderColor: z.string().regex(COLOR).optional(),
  borderWidth: z.string().regex(LENGTHS).max(40).optional(),
  borderStyle: z.enum(['none', 'solid', 'dashed', 'dotted', 'double']).optional(),
  borderRadius: z.string().regex(LENGTHS).max(40).optional(),
  padding: z.string().regex(LENGTHS).max(60).optional(),
  margin: z.string().regex(LENGTHS).max(60).optional(),
  fontSize: z.string().regex(LENGTHS).max(40).optional(),
  fontWeight: z.string().regex(WEIGHT).optional(),
  textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
  className: z.string().max(300).refine(
    (c) => c.split(/\s+/).filter(Boolean).every((t) => CLASS_TOKEN.test(t) && !FORBIDDEN_CLASS.test(t)),
    { message: 'className contains a disallowed class (positioning, visibility, arbitrary values)' },
  ).optional(),
  customCss: z.string().max(1000).refine((css) => parseSafeCss(css).rejected.length === 0, {
    message: 'customCss may only use cosmetic properties (color, background-color, border*, margin*, padding*, font-*, text-*, line-height, letter-spacing, box-shadow, max-width) and no url()/@/!important',
  }).optional(),
}).optional();

export type BlockStyles = z.infer<typeof BlockStylesSchema>;
