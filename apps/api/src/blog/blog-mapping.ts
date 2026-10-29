import { BlogPostStatus, Prisma } from '@fit/db';
import type {
  AdminBlogPost,
  BlogAuthor,
  BlogCategory,
  BlogLang,
  BlogPostVisibility,
} from '@fit/types';

/** What every admin read of a category selects — the row plus its post count. */
export const CATEGORY_INCLUDE = { _count: { select: { posts: true } } } as const;

/** What every admin read of an author selects — the row plus its post count. */
export const AUTHOR_INCLUDE = { _count: { select: { posts: true } } } as const;

/** What every admin read of a post selects — the row with category and author. */
export const POST_INCLUDE = {
  category: { include: CATEGORY_INCLUDE },
  author: { include: AUTHOR_INCLUDE },
} as const;

export type CategoryRecord = Prisma.BlogCategoryGetPayload<{ include: typeof CATEGORY_INCLUDE }>;
export type AuthorRecord = Prisma.BlogAuthorGetPayload<{ include: typeof AUTHOR_INCLUDE }>;
export type PostRecord = Prisma.BlogPostGetPayload<{ include: typeof POST_INCLUDE }>;

/** True when a post has an English version — a non-empty `titleEn`. */
export function hasEnglish(post: { titleEn: string | null }): boolean {
  return typeof post.titleEn === 'string' && post.titleEn.trim() !== '';
}

/** `ka` always; `en` too when the post has an English title. */
export function availableLangs(post: { titleEn: string | null }): BlogLang[] {
  return hasEnglish(post) ? ['ka', 'en'] : ['ka'];
}

/**
 * Where a post stands for its readers: a DRAFT is a draft; a PUBLISHED post whose
 * `publishAt` is still ahead is scheduled; otherwise it is live.
 */
export function visibilityOf(
  post: { status: BlogPostStatus; publishAt: Date | null },
  now: Date,
): BlogPostVisibility {
  if (post.status !== BlogPostStatus.PUBLISHED) return 'draft';
  if (post.publishAt && post.publishAt.getTime() > now.getTime()) return 'scheduled';
  return 'published';
}

export function toCategory(row: CategoryRecord): BlogCategory {
  return {
    id: row.id,
    slug: row.slug,
    nameKa: row.nameKa,
    nameEn: row.nameEn,
    postCount: row._count.posts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAuthor(row: AuthorRecord): BlogAuthor {
  return {
    id: row.id,
    name: row.name,
    photoUrl: row.photoUrl,
    bioKa: row.bioKa,
    bioEn: row.bioEn,
    postCount: row._count.posts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAdminPost(row: PostRecord, now: Date): AdminBlogPost {
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    visibility: visibilityOf(row, now),
    publishAt: row.publishAt?.toISOString() ?? null,
    titleKa: row.titleKa,
    excerptKa: row.excerptKa,
    contentHtmlKa: row.contentHtmlKa,
    metaTitleKa: row.metaTitleKa,
    metaDescriptionKa: row.metaDescriptionKa,
    titleEn: row.titleEn,
    excerptEn: row.excerptEn,
    contentHtmlEn: row.contentHtmlEn,
    metaTitleEn: row.metaTitleEn,
    metaDescriptionEn: row.metaDescriptionEn,
    coverImageUrl: row.coverImageUrl,
    ogImageUrl: row.ogImageUrl,
    contentImageUrls: row.contentImageUrls,
    tags: row.tags,
    availableLangs: availableLangs(row),
    categoryId: row.categoryId,
    category: row.category ? toCategory(row.category) : null,
    authorId: row.authorId,
    author: row.author ? toAuthor(row.author) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The filter for posts the public may see at `now`: PUBLISHED with `publishAt`
 * passed — and, for English, an English title. (A blank `titleEn` is never stored,
 * since the contract turns it into `null`, but it is excluded here all the same.)
 */
export function visiblePostsWhere(now: Date, lang?: BlogLang): Prisma.BlogPostWhereInput {
  return {
    status: BlogPostStatus.PUBLISHED,
    publishAt: { lte: now },
    ...(lang === 'en' ? { AND: [{ titleEn: { not: null } }, { titleEn: { not: '' } }] } : {}),
  };
}

/** True when `error` is Prisma's unique-constraint violation (`P2002`). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** True when `error` is Prisma's "record to update/delete not found" (`P2025`). */
export function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}
