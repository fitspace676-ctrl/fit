import { describe, expect, it } from 'vitest';
import { extractBlogImageUrls, isBlogImageSrc, sanitizeBlogHtml } from './blog-content';

const BASE = 'https://media.formacore.io';
const OWN_IMG = `${BASE}/platform/blog/0b7c.png`;

describe('sanitizeBlogHtml', () => {
  it('keeps the editor formatting untouched', () => {
    const html =
      '<h2>Title</h2><p>Some <strong>bold</strong>, <em>italic</em>, <u>under</u> and <s>gone</s>.</p>' +
      '<ul><li>one</li></ul><ol><li>two</li></ol><blockquote>quote</blockquote>' +
      '<pre><code>x = 1</code></pre><hr /><h3>Sub</h3><h4>Subsub</h4>';
    expect(sanitizeBlogHtml(html, BASE)).toBe(html);
  });

  it('drops script and style together with their contents', () => {
    const out = sanitizeBlogHtml(
      '<p>a</p><script>alert(1)</script><style>p{color:red}</style><p>b</p>',
      BASE,
    );
    expect(out).toBe('<p>a</p><p>b</p>');
  });

  it('drops iframes, inline styles, classes and event handlers', () => {
    const out = sanitizeBlogHtml(
      '<iframe src="https://evil.example"></iframe>' +
        '<p style="color:red" class="x" onclick="steal()">text</p>',
      BASE,
    );
    expect(out).toBe('<p>text</p>');
  });

  it('strips onerror from an otherwise allowed image', () => {
    const out = sanitizeBlogHtml(`<img src="${OWN_IMG}" onerror="alert(1)" alt="a" />`, BASE);
    expect(out).toBe(`<img src="${OWN_IMG}" alt="a" />`);
  });

  it('keeps an image hosted on the R2 public host under platform/blog/', () => {
    const out = sanitizeBlogHtml(
      `<figure><img src="${OWN_IMG}" alt="x" width="640" height="auto" /><figcaption>c</figcaption></figure>`,
      BASE,
    );
    expect(out).toBe(
      `<figure><img src="${OWN_IMG}" alt="x" width="640" /><figcaption>c</figcaption></figure>`,
    );
  });

  it('drops images from a foreign host, another prefix, or a data: URI', () => {
    for (const src of [
      'https://evil.example/platform/blog/a.png',
      `${BASE}/gym-1/products/a.png`,
      'data:image/png;base64,AAAA',
      'javascript:alert(1)',
      '//media.formacore.io/platform/blog/a.png',
      `${BASE}/platform/blog/../gym-1/a.png`,
    ]) {
      expect(sanitizeBlogHtml(`<p>x</p><img src="${src}" />`, BASE)).toBe('<p>x</p>');
    }
  });

  it('adds rel="noopener noreferrer" to every link and keeps only target=_blank', () => {
    expect(sanitizeBlogHtml('<a href="https://formacore.io">x</a>', BASE)).toBe(
      '<a rel="noopener noreferrer" href="https://formacore.io">x</a>',
    );
    expect(
      sanitizeBlogHtml('<a href="https://a.io" target="_blank" rel="opener">x</a>', BASE),
    ).toBe('<a rel="noopener noreferrer" href="https://a.io" target="_blank">x</a>');
    expect(sanitizeBlogHtml('<a href="https://a.io" target="_top">x</a>', BASE)).toBe(
      '<a rel="noopener noreferrer" href="https://a.io">x</a>',
    );
    expect(sanitizeBlogHtml('<a href="mailto:hi@formacore.io">m</a>', BASE)).toContain(
      'href="mailto:hi@formacore.io"',
    );
  });

  it('removes a javascript: href but keeps the link text', () => {
    const out = sanitizeBlogHtml('<a href="javascript:alert(1)">click</a>', BASE);
    expect(out).not.toContain('javascript');
    expect(out).toContain('click');
  });

  it('unwraps unknown tags, keeping their text', () => {
    expect(sanitizeBlogHtml('<div><h1>Big</h1><span>s</span></div>', BASE)).toBe('Bigs');
  });
});

describe('isBlogImageSrc', () => {
  it('without a configured host checks only the key', () => {
    expect(isBlogImageSrc('https://any.host/platform/blog/a.png', undefined)).toBe(true);
    expect(isBlogImageSrc('https://any.host/gym-1/blog/a.png', undefined)).toBe(false);
    expect(isBlogImageSrc('platform/blog/a.png', undefined)).toBe(false);
  });
});

describe('extractBlogImageUrls', () => {
  it('lists each distinct image src in order', () => {
    const a = `${BASE}/platform/blog/a.png`;
    const b = `${BASE}/platform/blog/b.webp`;
    const html = `<p><img src="${a}" /></p><img src="${b}" alt="" /><img src="${a}" />`;
    expect(extractBlogImageUrls(html)).toEqual([a, b]);
  });

  it('decodes entities so the URL matches what is stored', () => {
    expect(extractBlogImageUrls('<img src="https://h/platform/blog/a.png?x=1&amp;y=2" />')).toEqual(
      ['https://h/platform/blog/a.png?x=1&y=2'],
    );
  });

  it('returns nothing for empty input', () => {
    expect(extractBlogImageUrls('')).toEqual([]);
    expect(extractBlogImageUrls(null)).toEqual([]);
  });
});
