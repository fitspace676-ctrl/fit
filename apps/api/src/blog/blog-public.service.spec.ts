import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { BlogPostStatus } from '@fit/db';
import type { PrismaService } from '../prisma/prisma.service';
import { BlogPublicService } from './blog-public.service';

const HOUR = 3_600_000;
const now = Date.now();

const news = { id: 'cat-news', slug: 'news', nameKa: 'სიახლეები', nameEn: 'News' };
const guides = { id: 'cat-guides', slug: 'guides', nameKa: 'გზამკვლევები', nameEn: 'Guides' };
const nino = { id: 'a-1', name: 'Nino', photoUrl: null, bioKa: 'ბიო', bioEn: 'Bio' };

interface Row {
  id: string;
  slug: string;
  status: BlogPostStatus;
  publishAt: Date | null;
  titleKa: string;
  titleEn: string | null;
  excerptKa: string | null;
  excerptEn: string | null;
  contentHtmlKa: string;
  contentHtmlEn: string | null;
  metaTitleKa: string | null;
  metaTitleEn: string | null;
  metaDescriptionKa: string | null;
  metaDescriptionEn: string | null;
  coverImageUrl: string | null;
  ogImageUrl: string | null;
  tags: string[];
  category: typeof news | null;
  author: typeof nino | null;
  updatedAt: Date;
}

function row(id: string, overrides: Partial<Row>): Row {
  return {
    id,
    slug: id,
    status: BlogPostStatus.PUBLISHED,
    publishAt: new Date(now - HOUR),
    titleKa: `სათაური ${id}`,
    titleEn: null,
    excerptKa: null,
    excerptEn: null,
    contentHtmlKa: `<p>${id} ka</p>`,
    contentHtmlEn: null,
    metaTitleKa: null,
    metaTitleEn: null,
    metaDescriptionKa: null,
    metaDescriptionEn: null,
    coverImageUrl: null,
    ogImageUrl: null,
    tags: [],
    category: null,
    author: null,
    updatedAt: new Date(now - HOUR),
    ...overrides,
  };
}

const ROWS: Row[] = [
  row('both', {
    titleEn: 'Both',
    contentHtmlEn: '<p>both en</p>',
    excerptKa: 'მოკლედ',
    excerptEn: 'Short',
    tags: ['crm', 'growth'],
    category: news,
    author: nino,
    publishAt: new Date(now - 2 * HOUR),
  }),
  row('ka-only', { tags: ['crm'], category: guides }),
  row('blank-en', { titleEn: '' }),
  row('draft', { status: BlogPostStatus.DRAFT, titleEn: 'Draft', publishAt: null }),
  row('scheduled', { titleEn: 'Later', publishAt: new Date(now + HOUR), category: news }),
];

type Where = Record<string, unknown>;

/** Just enough of Prisma's `where` semantics for the filters the service builds. */
function matches(r: Row, where: Where): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'AND') {
      if (!(cond as Where[]).every((w) => matches(r, w))) return false;
    } else if (key === 'status' || key === 'slug') {
      if (r[key] !== cond) return false;
    } else if (key === 'publishAt') {
      const lte = (cond as { lte: Date }).lte;
      if (!r.publishAt || r.publishAt > lte) return false;
    } else if (key === 'titleEn') {
      const not = (cond as { not: unknown }).not;
      if (r.titleEn === not) return false;
    } else if (key === 'category') {
      if (r.category?.slug !== (cond as { slug: string }).slug) return false;
    } else if (key === 'tags') {
      if (!r.tags.includes((cond as { has: string }).has)) return false;
    } else {
      throw new Error(`unsupported where key ${key}`);
    }
  }
  return true;
}

function setup() {
  const filter = (args: { where: Where }) => ROWS.filter((r) => matches(r, args.where));
  const findMany = vi.fn((args: { where: Where; skip?: number; take?: number }) => {
    const sorted = filter(args).sort((a, b) => b.publishAt!.getTime() - a.publishAt!.getTime());
    const start = args.skip ?? 0;
    return Promise.resolve(sorted.slice(start, args.take ? start + args.take : undefined));
  });
  const count = vi.fn((args: { where: Where }) => Promise.resolve(filter(args).length));
  const findFirst = vi.fn((args: { where: Where }) => Promise.resolve(filter(args)[0] ?? null));
  const categoryFindMany = vi.fn(
    (args: { include: { _count: { select: { posts: { where: Where } } } } }) => {
      const where = args.include._count.select.posts.where;
      return Promise.resolve(
        [guides, news].map((c) => ({
          ...c,
          _count: { posts: filter({ where }).filter((r) => r.category?.id === c.id).length },
        })),
      );
    },
  );
  const prisma = {
    client: {
      blogPost: { findMany, count, findFirst },
      blogCategory: { findMany: categoryFindMany },
    },
  } as unknown as PrismaService;
  return { service: new BlogPublicService(prisma), findMany };
}

describe('BlogPublicService', () => {
  it('lists only PUBLISHED posts whose publishAt has passed, newest first', async () => {
    const { service, findMany } = setup();
    const result = await service.listPosts({ lang: 'ka', page: 1, pageSize: 12 });
    expect(result.items.map((p) => p.slug)).toEqual(['ka-only', 'blank-en', 'both']);
    expect(result.total).toBe(3);
    const where = findMany.mock.calls[0]![0].where as { status: string; publishAt: { lte: Date } };
    expect(where.status).toBe('PUBLISHED');
    expect(where.publishAt.lte.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('lang=en returns only posts with an English title, flattened to English', async () => {
    const { service } = setup();
    const result = await service.listPosts({ lang: 'en', page: 1, pageSize: 12 });
    expect(result.items.map((p) => p.slug)).toEqual(['both']);
    expect(result.items[0]).toMatchObject({
      lang: 'en',
      title: 'Both',
      excerpt: 'Short',
      category: { slug: 'news', name: 'News' },
      author: { name: 'Nino', bio: 'Bio' },
      availableLangs: ['ka', 'en'],
    });
    expect(result.items[0]).not.toHaveProperty('contentHtml');
  });

  it('filters by category slug and by tag', async () => {
    const { service } = setup();
    const byCategory = await service.listPosts({
      lang: 'ka',
      category: 'guides',
      page: 1,
      pageSize: 12,
    });
    expect(byCategory.items.map((p) => p.slug)).toEqual(['ka-only']);
    const byTag = await service.listPosts({ lang: 'ka', tag: 'crm', page: 1, pageSize: 12 });
    expect(byTag.items.map((p) => p.slug)).toEqual(['ka-only', 'both']);
  });

  it('pages with skip/take and reports the full total', async () => {
    const { service } = setup();
    const page2 = await service.listPosts({ lang: 'ka', page: 2, pageSize: 2 });
    expect(page2.items.map((p) => p.slug)).toEqual(['both']);
    expect(page2).toMatchObject({ page: 2, pageSize: 2, total: 3 });
  });

  it('serves a post in Georgian with its body', async () => {
    const { service } = setup();
    const post = await service.getPost('both', 'ka');
    expect(post).toMatchObject({
      slug: 'both',
      lang: 'ka',
      title: 'სათაური both',
      contentHtml: '<p>both ka</p>',
      category: { name: 'სიახლეები' },
      author: { bio: 'ბიო' },
    });
  });

  it('serves the English version when it exists', async () => {
    const { service } = setup();
    expect((await service.getPost('both', 'en')).contentHtml).toBe('<p>both en</p>');
  });

  it('404s a Georgian-only post asked for in English, but serves it in Georgian', async () => {
    const { service } = setup();
    await expect(service.getPost('ka-only', 'en')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getPost('blank-en', 'en')).rejects.toBeInstanceOf(NotFoundException);
    expect((await service.getPost('ka-only', 'ka')).availableLangs).toEqual(['ka']);
  });

  it('404s drafts, scheduled posts and unknown slugs alike', async () => {
    const { service } = setup();
    for (const slug of ['draft', 'scheduled', 'missing']) {
      await expect(service.getPost(slug, 'ka')).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('lists categories that hold visible posts in the language, with counts', async () => {
    const { service } = setup();
    expect((await service.listCategories('ka')).items).toEqual([
      { slug: 'guides', name: 'გზამკვლევები', postCount: 1 },
      { slug: 'news', name: 'სიახლეები', postCount: 1 },
    ]);
    expect((await service.listCategories('en')).items).toEqual([
      { slug: 'news', name: 'News', postCount: 1 },
    ]);
  });

  it('counts tags on visible posts, most used first', async () => {
    const { service } = setup();
    expect((await service.listTags('ka')).items).toEqual([
      { tag: 'crm', count: 2 },
      { tag: 'growth', count: 1 },
    ]);
    expect((await service.listTags('en')).items).toEqual([
      { tag: 'crm', count: 1 },
      { tag: 'growth', count: 1 },
    ]);
  });

  it('indexes every visible post with its languages', async () => {
    const { service } = setup();
    const { items } = await service.index();
    expect(items.map((i) => [i.slug, i.langs])).toEqual([
      ['ka-only', ['ka']],
      ['blank-en', ['ka']],
      ['both', ['ka', 'en']],
    ]);
    expect(items[2]!.publishAt).toBe(new Date(now - 2 * HOUR).toISOString());
  });
});
