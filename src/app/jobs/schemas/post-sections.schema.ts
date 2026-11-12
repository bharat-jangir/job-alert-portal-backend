import { z } from 'zod';

/**
 * Structured body content for a post. The admin editor produces these blocks and the
 * public site renders them with typed components (and derives JSON-LD from them).
 */
const short = z.string().max(300);
const text = z.string().max(20_000);
const url = z.url({ protocol: /^https?$/ }).max(2000);
const align = z.enum(['left', 'center', 'right']);

/** Hosts we allow in <iframe> embeds. Keep in sync with sanitize.ts and the frontend renderer. */
export const VIDEO_HOSTS = ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'vimeo.com', 'player.vimeo.com'];
export const EMBED_HOSTS = ['docs.google.com', 'drive.google.com', 'www.google.com', 'maps.google.com'];
const hostOk = (hosts: string[]) => (u: string) => {
  try { return hosts.includes(new URL(u).hostname.toLowerCase()); } catch { return false; }
};
const videoUrl = url.refine(hostOk(VIDEO_HOSTS), { message: 'video must be a YouTube or Vimeo link' });
const embedUrl = url
  .refine(hostOk(EMBED_HOSTS), { message: 'embed host is not allowed (Google Docs/Drive/Maps/Forms only)' })
  // www.google.com is only allowed for the Maps embed path, not arbitrary Google pages
  .refine((u) => { try { const x = new URL(u); return x.hostname !== 'www.google.com' || x.pathname.startsWith('/maps/embed'); } catch { return false; } }, { message: 'only google.com/maps/embed links are allowed on www.google.com' });

/** Blocks allowed inside a column (no nesting of columns, no raw html/toc/embeds). */
const leafOptions = [
  z.object({ type: z.literal('paragraph'), text }),
  z.object({ type: z.literal('heading'), level: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3), text: short }),
  z.object({ type: z.literal('list'), title: short.optional(), ordered: z.boolean().default(false), items: z.array(z.string().max(2000)).max(100) }),
  z.object({ type: z.literal('steps'), title: short.optional(), items: z.array(z.string().max(2000)).max(50) }),
  z.object({ type: z.literal('image'), src: url, alt: z.string().max(300).default(''), caption: z.string().max(500).optional(), width: z.number().int().min(1).max(10000).optional(), height: z.number().int().min(1).max(10000).optional(), link: url.optional() }),
  z.object({ type: z.literal('button'), label: short, url, style: z.enum(['primary', 'secondary', 'outline']).default('primary'), align: align.default('left') }),
  z.object({ type: z.literal('keyvalue'), title: short.optional(), items: z.array(z.object({ label: short, value: z.string().max(2000) })).max(100) }),
  z.object({ type: z.literal('callout'), tone: z.enum(['info', 'warning', 'success']).default('info'), text }),
  z.object({ type: z.literal('quote'), text, cite: short.optional(), style: z.enum(['quote', 'pull']).default('quote') }),
  z.object({ type: z.literal('links'), title: short.optional(), items: z.array(z.object({ label: short, url })).max(50) }),
  z.object({ type: z.literal('download'), label: short, url, fileType: z.string().max(20).optional(), size: z.string().max(30).optional() }),
  z.object({ type: z.literal('separator'), style: z.enum(['line', 'dots', 'space']).default('line') }),
] as const;
export const LeafSchema = z.discriminatedUnion('type', [...leafOptions]);

export const SectionSchema = z.discriminatedUnion('type', [
  ...leafOptions,
  z.object({
    type: z.literal('table'),
    title: short.optional(),
    headers: z.array(z.string().max(200)).max(12),
    rows: z.array(z.array(z.string().max(2000)).max(12)).max(300),
    align: z.array(align).max(12).optional(),
  }),
  z.object({
    type: z.literal('faq'),
    title: short.optional(),
    items: z.array(z.object({ question: short, answer: z.string().max(5000) })).max(50),
  }),
  z.object({
    type: z.literal('accordion'),
    title: short.optional(),
    items: z.array(z.object({ title: short, content: z.string().max(5000) })).max(50),
  }),
  z.object({
    type: z.literal('timeline'),
    title: short.optional(),
    items: z.array(z.object({ date: short, title: short, text: z.string().max(2000).optional() })).max(100),
  }),
  z.object({ type: z.literal('gallery'), title: short.optional(), images: z.array(z.object({ src: url, alt: z.string().max(300).default(''), caption: z.string().max(500).optional() })).max(40) }),
  z.object({ type: z.literal('video'), url: videoUrl, title: short, caption: z.string().max(500).optional() }),
  z.object({ type: z.literal('audio'), src: url, title: short.optional() }),
  z.object({ type: z.literal('embed'), url: embedUrl, title: short, caption: z.string().max(500).optional(), height: z.number().int().min(100).max(1500).default(500) }),
  z.object({ type: z.literal('code'), code: z.string().max(50_000), language: z.string().max(30).optional() }),
  z.object({ type: z.literal('toc'), title: short.optional() }),
  z.object({ type: z.literal('ad'), slot: z.string().regex(/^[a-z0-9-]{1,40}$/, 'ad slot must be lowercase letters, numbers and hyphens') }),
  z.object({
    type: z.literal('columns'),
    columns: z.array(z.object({ blocks: z.array(LeafSchema).max(30) })).min(2).max(4),
  }),
  z.object({ type: z.literal('html'), html: z.string().max(200_000) }),
]);

export const SectionsSchema = z.array(SectionSchema).max(150);
export type Section = z.infer<typeof SectionSchema>;

export function firstIssue(error: z.ZodError): string {
  const i = error.issues[0];
  return `sections.${i.path.join('.')}: ${i.message}`;
}
