import sanitizeHtml from 'sanitize-html';

export function isBlogImage(src: string): boolean {
  try {
    if (!/^https?:\/\//i.test(src)) return false;
    const url = new URL(src);
    const path = decodeURIComponent(url.pathname).replace(/^\//, '');
    return (
      path.startsWith('platform/blog/') &&
      path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
    );
  } catch {
    return false;
  }
}

export function sanitizeBlogHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
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
    ],
    allowedAttributes: { a: ['href', 'rel'], img: ['src', 'alt', 'width', 'height'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) },
    exclusiveFilter: (frame) => frame.tag === 'img' && !isBlogImage(frame.attribs.src ?? ''),
  });
}
