import { describe, expect, it, vi } from 'vitest';
import { fetchBlogIndex } from '@/lib/blog';
import sitemap from './sitemap';

vi.mock('@/lib/blog', () => ({ fetchBlogIndex: vi.fn() }));

describe('platform sitemap', () => {
  it('preserves both locales for static pages and includes only published post languages', async () => {
    vi.mocked(fetchBlogIndex).mockResolvedValue({
      items: [
        {
          slug: 'bilingual',
          langs: ['ka', 'en'],
          publishAt: '2026-11-01T00:00:00Z',
          updatedAt: '2026-11-01T00:00:00Z',
        },
        {
          slug: 'georgian-only',
          langs: ['ka'],
          publishAt: '2026-11-01T00:00:00Z',
          updatedAt: '2026-11-01T00:00:00Z',
        },
      ],
    });
    const entries = await sitemap();
    for (const path of ['/resources', '/pricing', '/register-gym', '/features', '/built-for']) {
      for (const prefix of ['', '/ka']) {
        expect(entries).toContainEqual(
          expect.objectContaining({
            url: `https://formacore.io${prefix}${path}`,
            alternates: {
              languages: {
                en: `https://formacore.io${path}`,
                ka: `https://formacore.io/ka${path}`,
                'x-default': `https://formacore.io${path}`,
              },
            },
          }),
        );
      }
    }
    expect(
      entries.find(({ url }) => url.endsWith('/ka/resources/georgian-only'))?.alternates?.languages,
    ).toEqual({ ka: 'https://formacore.io/ka/resources/georgian-only' });
    expect(entries.some(({ url }) => url === 'https://formacore.io/resources/georgian-only')).toBe(
      false,
    );
    expect(
      entries.find(({ url }) => url.endsWith('/resources/bilingual'))?.alternates?.languages,
    ).toEqual({
      ka: 'https://formacore.io/ka/resources/bilingual',
      en: 'https://formacore.io/resources/bilingual',
    });
  });
});
