/** Escape user input before building a RegExp. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** URL-friendly slug (ASCII). Falls back to a timestamp slug for non-latin titles. */
export function slugify(input: string): string {
  const slug = (input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110)
    .replace(/-+$/g, '');
  return slug || `post-${Date.now().toString(36)}`;
}
