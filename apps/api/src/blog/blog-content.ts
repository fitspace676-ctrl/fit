import sanitizeHtml from 'sanitize-html';
import { toObjectKey } from '../storage/media-key';

/**
 * Blog post bodies are HTML from the superadmin's WYSIWYG editor, rendered on the
 * public site with `dangerouslySetInnerHTML`. The API therefore never stores what
 * the browser sent: every write goes through {@link sanitizeBlogHtml}, an
 * allow-list that keeps the editor's formatting and drops everything that can run
 * code or pull in a foreign resource. The site sanitises again before rendering
 * with the same list — this is the first of two locks, not the only one.
 */

/** The storage owner and entity blog uploads are minted under: `platform/blog/…`. */
export const BLOG_MEDIA_OWNER = 'platform';
export const BLOG_MEDIA_ENTITY = 'blog';
const BLOG_MEDIA_PREFIX = `${BLOG_MEDIA_OWNER}/${BLOG_MEDIA_ENTITY}/`;

/** Tags the editor produces. Anything else is unwrapped (its text kept) or dropped. */
export const BLOG_ALLOWED_TAGS: readonly string[] = [
  'h2',
  'h3',
  'h4',
  'p',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'code',
  'pre',
  'img',
  'br',
  'hr',
  'figure',
  'figcaption',
];

/** Attributes kept per tag. No `style`, no `class`, no `on*` — on any tag. */
export const BLOG_ALLOWED_ATTRIBUTES: Readonly<Record<string, string[]>> = {
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height'],
};

const LINK_REL = 'noopener noreferrer';
const DIMENSION = /^\d{1,5}$/;

/**
 * True when `src` is a blog image this platform stored: an absolute http(s) URL
 * whose path is a `platform/blog/` key, served from `publicBase` when one is
 * configured. Anything else — a foreign host, a data: URI, another gym's media —
 * is not ours to render.
 */
export function isBlogImageSrc(src: string | undefined, publicBase: string | undefined): boolean {
  if (!src) return false;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (publicBase) {
    try {
      if (url.origin !== new URL(publicBase).origin) return false;
    } catch {
      return false;
    }
  }
  const key = toObjectKey(src);
  return (
    key !== null &&
    key.startsWith(BLOG_MEDIA_PREFIX) &&
    key.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

/**
 * Reduce editor HTML to the blog allow-list. Links keep http/https/mailto targets
 * only and always carry `rel="noopener noreferrer"`; `target` survives only as
 * `_blank`. Images survive only when {@link isBlogImageSrc} accepts their `src`,
 * and keep numeric `width` / `height` only. `script` / `style` are dropped with
 * their contents; `iframe` and every other unknown tag are dropped.
 */
export function sanitizeBlogHtml(html: string, publicBase: string | undefined): string {
  return sanitizeHtml(html, {
    allowedTags: [...BLOG_ALLOWED_TAGS],
    allowedAttributes: BLOG_ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (tagName, attribs) => {
        const next: Record<string, string> = { rel: LINK_REL };
        if (attribs.href !== undefined) next.href = attribs.href;
        if (attribs.target === '_blank') next.target = '_blank';
        return { tagName, attribs: next };
      },
      img: (tagName, attribs) => {
        const next: Record<string, string> = {};
        if (attribs.src !== undefined) next.src = attribs.src;
        if (attribs.alt !== undefined) next.alt = attribs.alt;
        if (attribs.width !== undefined && DIMENSION.test(attribs.width))
          next.width = attribs.width;
        if (attribs.height !== undefined && DIMENSION.test(attribs.height)) {
          next.height = attribs.height;
        }
        return { tagName, attribs: next };
      },
    },
    exclusiveFilter: (frame) =>
      frame.tag === 'img' && !isBlogImageSrc(frame.attribs.src, publicBase),
  });
}

/**
 * Every distinct `<img src>` in `html`, in document order. Meant for HTML that has
 * already been through {@link sanitizeBlogHtml}: the result is what the post
 * references, stored in `contentImageUrls` so the media sweep keeps those objects.
 */
export function extractBlogImageUrls(html: string | null | undefined): string[] {
  if (!html) return [];
  const urls: string[] = [];
  // sanitize-html is the HTML parser already in hand; its filter sees each tag's
  // decoded attributes, which is all this needs. The output is discarded.
  sanitizeHtml(html, {
    allowedTags: ['img'],
    allowedAttributes: { img: ['src'] },
    exclusiveFilter: (frame) => {
      const src = frame.attribs.src;
      if (frame.tag === 'img' && src && !urls.includes(src)) urls.push(src);
      return false;
    },
  });
  return urls;
}
