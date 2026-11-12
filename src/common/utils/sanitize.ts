import * as sanitizeHtml from 'sanitize-html';

/**
 * One sanitiser for every piece of editor-supplied HTML.
 * Keeps the tag/attribute allowances the project already had, but restricts iframes to known
 * embed hosts and forces safe rel/target on external links.
 */
const options: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img', 'h1', 'h2', 'span', 'div', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
    'caption', 'colgroup', 'col', 'figure', 'figcaption', 'mark', 'iframe',
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    '*': ['style', 'class', 'id'],
    a: ['href', 'name', 'target', 'rel', 'title'],
    img: ['src', 'srcset', 'alt', 'title', 'width', 'height', 'loading'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
    iframe: ['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'title'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedIframeHostnames: [
    'www.youtube.com', 'www.youtube-nocookie.com', 'docs.google.com', 'drive.google.com', 'player.vimeo.com',
  ],
  // an iframe whose host was rejected loses its src; drop the empty shell too
  exclusiveFilter: (frame) => frame.tag === 'iframe' && !frame.attribs.src,
  transformTags: {
    a: (tagName, attribs) => {
      const external = /^https?:\/\//i.test(attribs.href || '');
      return {
        tagName,
        attribs: { ...attribs, ...(external ? { rel: 'noopener noreferrer nofollow', target: '_blank' } : {}) },
      };
    },
    img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: 'lazy' } }),
  },
};

export function sanitizeContentHtml(html: string): string {
  return sanitizeHtml(html ?? '', options);
}
