import { describe, expect, it } from 'vitest';
import {
  blogLangSchema,
  blogPostStatusSchema,
  blogSlugSchema,
  createBlogAuthorSchema,
  createBlogCategorySchema,
  createBlogPostSchema,
  createBlogUploadSchema,
  listAdminBlogPostsQuerySchema,
  listPublicBlogPostsQuerySchema,
  publishBlogPostSchema,
  updateBlogCategorySchema,
  updateBlogPostSchema,
} from './blog';

describe('blog primitives', () => {
  it('accepts the two languages and the two statuses only', () => {
    expect(blogLangSchema.parse('ka')).toBe('ka');
    expect(blogLangSchema.parse('en')).toBe('en');
    expect(blogLangSchema.safeParse('de').success).toBe(false);
    expect(blogPostStatusSchema.parse('DRAFT')).toBe('DRAFT');
    expect(blogPostStatusSchema.safeParse('SCHEDULED').success).toBe(false);
  });

  it('accepts lowercase hyphenated slugs and rejects everything else', () => {
    expect(blogSlugSchema.parse('how-to-run-a-gym-2026')).toBe('how-to-run-a-gym-2026');
    expect(blogSlugSchema.parse('  trimmed  ')).toBe('trimmed');
    for (const bad of ['', 'Upper', 'double--hyphen', '-lead', 'trail-', 'with space', 'ქართული']) {
      expect(blogSlugSchema.safeParse(bad).success).toBe(false);
    }
    expect(blogSlugSchema.safeParse('a'.repeat(121)).success).toBe(false);
  });
});

describe('createBlogPostSchema', () => {
  const minimal = { slug: 'hello', titleKa: 'გამარჯობა' };

  it('needs only a slug and a Georgian title, and defaults the rest', () => {
    const parsed = createBlogPostSchema.parse(minimal);
    expect(parsed.contentHtmlKa).toBe('');
    expect(parsed.tags).toEqual([]);
    expect(parsed.titleEn).toBeUndefined();
  });

  it('refuses a post without a Georgian title', () => {
    expect(createBlogPostSchema.safeParse({ slug: 'hello', titleKa: '  ' }).success).toBe(false);
    expect(createBlogPostSchema.safeParse({ slug: 'hello', titleEn: 'Hi' }).success).toBe(false);
  });

  it('normalises tags: trimmed, lowercased, de-duplicated', () => {
    const parsed = createBlogPostSchema.parse({ ...minimal, tags: [' CRM ', 'crm', 'Fitness'] });
    expect(parsed.tags).toEqual(['crm', 'fitness']);
  });

  it('caps tags at 20, each at 40 characters', () => {
    const many = Array.from({ length: 21 }, (_, i) => `t${i}`);
    expect(createBlogPostSchema.safeParse({ ...minimal, tags: many }).success).toBe(false);
    expect(createBlogPostSchema.safeParse({ ...minimal, tags: ['x'.repeat(41)] }).success).toBe(
      false,
    );
    expect(createBlogPostSchema.safeParse({ ...minimal, tags: [' '] }).success).toBe(false);
  });

  it('turns blank optional text into null', () => {
    const parsed = createBlogPostSchema.parse({ ...minimal, titleEn: '  ', coverImageUrl: '' });
    expect(parsed.titleEn).toBeNull();
    expect(parsed.coverImageUrl).toBeNull();
  });
});

describe('updateBlogPostSchema', () => {
  it('accepts an empty patch and leaves omitted fields undefined', () => {
    const parsed = updateBlogPostSchema.parse({});
    expect(parsed).toEqual({});
  });

  it('still validates the fields it is given', () => {
    expect(updateBlogPostSchema.safeParse({ slug: 'Bad Slug' }).success).toBe(false);
    expect(updateBlogPostSchema.parse({ titleEn: null }).titleEn).toBeNull();
  });
});

describe('publishBlogPostSchema', () => {
  it('takes an optional ISO instant', () => {
    expect(publishBlogPostSchema.parse({})).toEqual({});
    expect(publishBlogPostSchema.parse({ publishAt: '2026-11-01T09:00:00.000Z' }).publishAt).toBe(
      '2026-11-01T09:00:00.000Z',
    );
    expect(publishBlogPostSchema.parse({ publishAt: '2026-11-01T13:00:00+04:00' }).publishAt).toBe(
      '2026-11-01T13:00:00+04:00',
    );
    expect(publishBlogPostSchema.safeParse({ publishAt: 'tomorrow' }).success).toBe(false);
  });
});

describe('list queries', () => {
  it('admin list coerces paging and drops a blank search', () => {
    const parsed = listAdminBlogPostsQuerySchema.parse({ page: '2', pageSize: '10', q: ' ' });
    expect(parsed).toEqual({ page: 2, pageSize: 10, q: undefined });
    expect(listAdminBlogPostsQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });

  it('public list defaults to Georgian and caps the page size at 50', () => {
    expect(listPublicBlogPostsQuerySchema.parse({})).toEqual({ lang: 'ka', page: 1, pageSize: 12 });
    expect(listPublicBlogPostsQuerySchema.safeParse({ pageSize: '51' }).success).toBe(false);
    expect(listPublicBlogPostsQuerySchema.parse({ tag: ' CRM ' }).tag).toBe('crm');
    expect(listPublicBlogPostsQuerySchema.safeParse({ lang: 'fr' }).success).toBe(false);
  });
});

describe('categories, authors, uploads', () => {
  it('category needs a slug and both names; update is partial', () => {
    expect(
      createBlogCategorySchema.safeParse({ slug: 'news', nameKa: 'სიახლეები', nameEn: 'News' })
        .success,
    ).toBe(true);
    expect(createBlogCategorySchema.safeParse({ slug: 'news', nameKa: 'სიახლეები' }).success).toBe(
      false,
    );
    expect(updateBlogCategorySchema.parse({ nameEn: 'Updates' })).toEqual({ nameEn: 'Updates' });
  });

  it('author needs a name; photo and bios are optional', () => {
    expect(createBlogAuthorSchema.parse({ name: 'Nino' })).toEqual({ name: 'Nino' });
    expect(createBlogAuthorSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('upload accepts raster images only', () => {
    expect(
      createBlogUploadSchema.parse({ contentType: 'image/png', contentLength: '1024' }),
    ).toEqual({ contentType: 'image/png', contentLength: 1024 });
    expect(
      createBlogUploadSchema.safeParse({ contentType: 'image/svg+xml', contentLength: 10 }).success,
    ).toBe(false);
    expect(
      createBlogUploadSchema.safeParse({ contentType: 'image/png', contentLength: 0 }).success,
    ).toBe(false);
  });
});
