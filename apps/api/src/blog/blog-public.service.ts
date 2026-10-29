import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  BlogLang,
  ListPublicBlogPostsQuery,
  PublicBlogCategoryListResponse,
  PublicBlogIndexResponse,
  PublicBlogPost,
  PublicBlogPostListResponse,
  PublicBlogPostSummary,
  PublicBlogTagListResponse,
} from '@fit/types';
import type { Prisma } from '@fit/db';
import { PrismaService } from '../prisma/prisma.service';
import { availableLangs, hasEnglish, visiblePostsWhere } from './blog-mapping';

const PUBLIC_POST_INCLUDE = { category: true, author: true } as const;
type PublicPostRecord = Prisma.BlogPostGetPayload<{ include: typeof PUBLIC_POST_INCLUDE }>;

/**
 * The public read side of the platform blog (`/platform/blog/*`), called by the
 * formacore.io site without a session.
 *
 * Only *visible* posts exist here: PUBLISHED with `publishAt` passed. A draft, a
 * scheduled post and an unknown slug are all the same `404`, so the endpoint does
 * not reveal what is in the pipeline. `lang=en` narrows everything to posts with
 * an English version; Georgian sees every visible post.
 *
 * Responses are flattened to one language — `title`, not `titleKa`/`titleEn` — so
 * the site never has to choose fields, and admin-only columns never leave.
 */
@Injectable()
export class BlogPublicService {
  constructor(private readonly prisma: PrismaService) {}

  async listPosts(query: ListPublicBlogPostsQuery): Promise<PublicBlogPostListResponse> {
    const where: Prisma.BlogPostWhereInput = {
      ...visiblePostsWhere(new Date(), query.lang),
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.client.blogPost.findMany({
        where,
        include: PUBLIC_POST_INCLUDE,
        orderBy: [{ publishAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.blogPost.count({ where }),
    ]);
    return {
      items: rows.map((row) => toSummary(row, query.lang)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /** One visible post in `lang`; `404` when hidden, unknown, or lacking that language. */
  async getPost(slug: string, lang: BlogLang): Promise<PublicBlogPost> {
    const row = await this.prisma.client.blogPost.findFirst({
      where: { ...visiblePostsWhere(new Date(), lang), slug },
      include: PUBLIC_POST_INCLUDE,
    });
    if (!row || (lang === 'en' && !hasEnglish(row))) {
      throw new NotFoundException({ code: 'BLOG_POST_NOT_FOUND', message: 'Blog post not found' });
    }
    return {
      ...toSummary(row, lang),
      contentHtml: (lang === 'en' ? row.contentHtmlEn : row.contentHtmlKa) ?? '',
    };
  }

  /** Categories holding at least one visible post in `lang`, with that count. */
  async listCategories(lang: BlogLang): Promise<PublicBlogCategoryListResponse> {
    const rows = await this.prisma.client.blogCategory.findMany({
      include: {
        _count: { select: { posts: { where: visiblePostsWhere(new Date(), lang) } } },
      },
      orderBy: [{ nameKa: 'asc' }, { id: 'asc' }],
    });
    return {
      items: rows
        .filter((row) => row._count.posts > 0)
        .map((row) => ({
          slug: row.slug,
          name: lang === 'en' ? row.nameEn : row.nameKa,
          postCount: row._count.posts,
        })),
    };
  }

  /** Tags on visible posts in `lang`, most used first, then alphabetical. */
  async listTags(lang: BlogLang): Promise<PublicBlogTagListResponse> {
    const rows = await this.prisma.client.blogPost.findMany({
      where: visiblePostsWhere(new Date(), lang),
      select: { tags: true },
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const tag of row.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return {
      items: [...counts]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
    };
  }

  /** Every visible post with its languages — the sitemap and RSS feeds' source. */
  async index(): Promise<PublicBlogIndexResponse> {
    const rows = await this.prisma.client.blogPost.findMany({
      where: visiblePostsWhere(new Date()),
      select: { slug: true, titleEn: true, publishAt: true, updatedAt: true },
      orderBy: [{ publishAt: 'desc' }, { id: 'desc' }],
    });
    return {
      items: rows.map((row) => ({
        slug: row.slug,
        langs: availableLangs(row),
        publishAt: (row.publishAt ?? row.updatedAt).toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }
}

/** A visible post flattened to `lang`, without its body. */
function toSummary(row: PublicPostRecord, lang: BlogLang): PublicBlogPostSummary {
  const en = lang === 'en';
  return {
    id: row.id,
    slug: row.slug,
    lang,
    title: (en ? row.titleEn : row.titleKa) ?? row.titleKa,
    excerpt: en ? row.excerptEn : row.excerptKa,
    coverImageUrl: row.coverImageUrl,
    ogImageUrl: row.ogImageUrl,
    metaTitle: en ? row.metaTitleEn : row.metaTitleKa,
    metaDescription: en ? row.metaDescriptionEn : row.metaDescriptionKa,
    tags: row.tags,
    category: row.category
      ? { slug: row.category.slug, name: en ? row.category.nameEn : row.category.nameKa }
      : null,
    author: row.author
      ? {
          name: row.author.name,
          photoUrl: row.author.photoUrl,
          bio: en ? row.author.bioEn : row.author.bioKa,
        }
      : null,
    // Never null for a visible post — the query requires `publishAt <= now`.
    publishAt: (row.publishAt ?? row.updatedAt).toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    availableLangs: availableLangs(row),
  };
}
