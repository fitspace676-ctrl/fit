import { describe, expect, it } from 'vitest';
import { sanitizeBlogHtml } from './blog-html';

describe('sanitizeBlogHtml', () => {
  it('removes executable markup and unsafe links', () => {
    const result = sanitizeBlogHtml(
      '<script>alert(1)</script><style>body{}</style><iframe src="https://evil.test"></iframe><p onclick="alert(1)">Safe</p><a href="javascript:alert(1)">Link</a><img src="https://cdn.test/platform/blog/photo.png" onerror="alert(1)">',
    );
    expect(result).not.toMatch(/script|style|iframe|onclick|onerror|javascript:/);
    expect(result).toContain('<p>Safe</p>');
    expect(result).toContain('src="https://cdn.test/platform/blog/photo.png"');
    expect(result).toContain('rel="noopener noreferrer"');
  });
  it.each([
    'https://cdn.test/other/photo.png',
    'platform/blog/photo.png',
    '//cdn.test/platform/blog/photo.png',
    'https://cdn.test/platform/blog/a//b.png',
    'https://cdn.test/platform/blog/a%2F..%2Fb.png',
    'https://cdn.test/platform/blog/%ZZ.png',
  ])('removes unsafe image %s', (src) => {
    expect(sanitizeBlogHtml(`<img src="${src}" alt="bad">`)).toBe('');
  });
  it('preserves editorial markup and safe links', () => {
    expect(
      sanitizeBlogHtml(
        '<h2>Title</h2><p><strong>Text</strong></p><a href="https://example.com" rel="opener">Visit</a>',
      ),
    ).toBe(
      '<h2>Title</h2><p><strong>Text</strong></p><a href="https://example.com" rel="noopener noreferrer">Visit</a>',
    );
  });
});
