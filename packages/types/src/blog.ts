// @fit/types — platform blog contracts (Zod schemas + inferred types).
//
// FormaCore's own blog on formacore.io, authored from the superadmin console.
// Platform-level: no gym owns a post. Two audiences, two shapes:
//
//   * The superadmin console (`/admin/blog/*`) reads and writes the whole row —
//     both languages side by side, status, schedule, SEO fields. That is
//     {@link AdminBlogPost}.
//   * The public site (`/platform/blog/*`, unauthenticated) receives one language
//     at a time, already flattened (`title`, not `titleKa`/`titleEn`). That is
//     {@link PublicBlogPost}. It is a separate shape on purpose, so a new admin
//     field cannot leak into the public response by omission.
//
// Georgian is required on every post; English is optional and counts as present
// only when `titleEn` is non-empty. A post is public when it is PUBLISHED and its
// `publishAt` has passed — a future `publishAt` is a scheduled post.

import { z } from 'zod';

/** Languages a post can be written in. Georgian is always present. */
export const BLOG_LANGS = ['ka', 'en'] as const;
export const blogLangSchema = z.enum(BLOG_LANGS);
export type BlogLang = z.infer<typeof blogLangSchema>;

/** Stored status. "Scheduled" is PUBLISHED with a future `publishAt`, not a status. */
export const blogPostStatusSchema = z.enum(['DRAFT', 'PUBLISHED']);
export type BlogPostStatus = z.infer<typeof blogPostStatusSchema>;

/**
 * What the console shows: DRAFT, PUBLISHED with `publishAt` in the future
 * (`scheduled`), or PUBLISHED and live (`published`). Derived server-side.
 */
export const blogPostVisibilitySchema = z.enum(['draft', 'scheduled', 'published']);
export type BlogPostVisibility = z.infer<typeof blogPostVisibilitySchema>;

/** Lowercase words joined by single hyphens — `how-to-run-a-gym`. */
export const BLOG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const blogSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(BLOG_SLUG_PATTERN, 'Use lowercase letters, digits and single hyphens');

export const BLOG_TAGS_MAX = 20;
export const BLOG_TAG_MAX_LENGTH = 40;

/** One tag: trimmed, lowercased, 1–40 characters. */
export const blogTagSchema = z.string().trim().toLowerCase().min(1).max(BLOG_TAG_MAX_LENGTH);

/** Up to 20 tags; duplicates (after normalising) collapse to one. */
export const blogTagsSchema = z
  .array(blogTagSchema)
  .max(BLOG_TAGS_MAX)
  .transform((tags) => [...new Set(tags)]);

/** Longest stored HTML body (characters) — generous, but bounded. */
export const BLOG_CONTENT_MAX = 200_000;

/**
 * An optional text field: `undefined` leaves it alone (on update), and `null` or
 * a blank string clears it.
 */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value));
}

/** An optional media reference — the public R2 URL returned by an upload. */
const optionalMediaUrl = optionalText(2048);

/** An optional foreign id; blank clears it like `null`. */
const optionalId = optionalText(64);

const blogPostFields = {
  slug: blogSlugSchema,
  titleKa: z.string().trim().min(1).max(200),
  excerptKa: optionalText(500),
  contentHtmlKa: z.string().max(BLOG_CONTENT_MAX),
  metaTitleKa: optionalText(120),
  metaDescriptionKa: optionalText(320),
  /** English is present when this is non-empty. Blank clears the English version. */
  titleEn: optionalText(200),
  excerptEn: optionalText(500),
  contentHtmlEn: z
    .string()
    .max(BLOG_CONTENT_MAX)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value)),
  metaTitleEn: optionalText(120),
  metaDescriptionEn: optionalText(320),
  coverImageUrl: optionalMediaUrl,
  ogImageUrl: optionalMediaUrl,
  tags: blogTagsSchema,
  categoryId: optionalId,
  authorId: optionalId,
};

/**
 * Body of `POST /admin/blog/posts`. A new post is always a DRAFT; going live is
 * `POST /admin/blog/posts/:id/publish`.
 */
export const createBlogPostSchema = z.object({
  ...blogPostFields,
  contentHtmlKa: blogPostFields.contentHtmlKa.default(''),
  tags: blogTagsSchema.default([]),
});
export type CreateBlogPostInput = z.input<typeof createBlogPostSchema>;
export type CreateBlogPostBody = z.output<typeof createBlogPostSchema>;

/** Body of `PATCH /admin/blog/posts/:id` — any subset; omitted fields are unchanged. */
export const updateBlogPostSchema = z.object(blogPostFields).partial();
export type UpdateBlogPostInput = z.input<typeof updateBlogPostSchema>;
export type UpdateBlogPostBody = z.output<typeof updateBlogPostSchema>;

/**
 * Body of `POST /admin/blog/posts/:id/publish`. No `publishAt` publishes now; a
 * future one schedules the post; a past one backdates it.
 */
export const publishBlogPostSchema = z.object({
  publishAt: z.string().datetime({ offset: true }).optional(),
});
export type PublishBlogPostBody = z.infer<typeof publishBlogPostSchema>;

const pageSchema = z.coerce.number().int().min(1).max(10_000).default(1);

/** Query of `GET /admin/blog/posts`. `lang=en` keeps posts that have English. */
export const listAdminBlogPostsQuerySchema = z.object({
  status: blogPostStatusSchema.optional(),
  lang: blogLangSchema.optional(),
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  page: pageSchema,
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListAdminBlogPostsQuery = z.output<typeof listAdminBlogPostsQuerySchema>;

/** Body of `POST /admin/blog/categories`. */
export const createBlogCategorySchema = z.object({
  slug: blogSlugSchema,
  nameKa: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().min(1).max(80),
});
export type CreateBlogCategoryBody = z.infer<typeof createBlogCategorySchema>;

/** Body of `PATCH /admin/blog/categories/:id`. */
export const updateBlogCategorySchema = createBlogCategorySchema.partial();
export type UpdateBlogCategoryBody = z.infer<typeof updateBlogCategorySchema>;

/** Body of `POST /admin/blog/authors`. */
export const createBlogAuthorSchema = z.object({
  name: z.string().trim().min(1).max(120),
  photoUrl: optionalMediaUrl,
  bioKa: optionalText(1000),
  bioEn: optionalText(1000),
});
export type CreateBlogAuthorBody = z.output<typeof createBlogAuthorSchema>;

/** Body of `PATCH /admin/blog/authors/:id`. */
export const updateBlogAuthorSchema = createBlogAuthorSchema.partial();
export type UpdateBlogAuthorBody = z.output<typeof updateBlogAuthorSchema>;

/** Image types a blog upload may be. SVG is left out: it can carry script. */
export const BLOG_UPLOAD_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/** Body of `POST /admin/blog/uploads` — answered with a presigned `SignedUpload`. */
export const createBlogUploadSchema = z.object({
  contentType: z.enum(BLOG_UPLOAD_CONTENT_TYPES),
  contentLength: z.coerce.number().int().positive(),
  fileName: z.string().trim().min(1).max(255).optional(),
});
export type CreateBlogUploadBody = z.infer<typeof createBlogUploadSchema>;

/** Query of `GET /platform/blog/posts`. */
export const listPublicBlogPostsQuerySchema = z.object({
  lang: blogLangSchema.default('ka'),
  category: blogSlugSchema.optional(),
  tag: blogTagSchema.optional(),
  page: pageSchema,
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});
export type ListPublicBlogPostsQuery = z.output<typeof listPublicBlogPostsQuerySchema>;

/** Query carrying only the language — `GET /platform/blog/posts/:slug`, categories, tags. */
export const blogLangQuerySchema = z.object({
  lang: blogLangSchema.default('ka'),
});
export type BlogLangQuery = z.output<typeof blogLangQuerySchema>;

// --- Responses (dates are ISO strings) --------------------------------------

/** A category as the console reads it. */
export interface BlogCategory {
  id: string;
  slug: string;
  nameKa: string;
  nameEn: string;
  /** Posts filed under it, any status. */
  postCount: number;
  createdAt: string;
  updatedAt: string;
}

/** An author as the console reads it. */
export interface BlogAuthor {
  id: string;
  name: string;
  photoUrl: string | null;
  bioKa: string | null;
  bioEn: string | null;
  /** Posts credited to them, any status. */
  postCount: number;
  createdAt: string;
  updatedAt: string;
}

/** `GET /admin/blog/categories`. */
export interface BlogCategoryListResponse {
  items: BlogCategory[];
}

/** `GET /admin/blog/authors`. */
export interface BlogAuthorListResponse {
  items: BlogAuthor[];
}

/** A post as the superadmin console reads it — the whole row. */
export interface AdminBlogPost {
  id: string;
  slug: string;
  status: BlogPostStatus;
  visibility: BlogPostVisibility;
  publishAt: string | null;
  titleKa: string;
  excerptKa: string | null;
  contentHtmlKa: string;
  metaTitleKa: string | null;
  metaDescriptionKa: string | null;
  titleEn: string | null;
  excerptEn: string | null;
  contentHtmlEn: string | null;
  metaTitleEn: string | null;
  metaDescriptionEn: string | null;
  coverImageUrl: string | null;
  ogImageUrl: string | null;
  contentImageUrls: string[];
  tags: string[];
  /** `ka` always; `en` when `titleEn` is non-empty. */
  availableLangs: BlogLang[];
  categoryId: string | null;
  category: BlogCategory | null;
  authorId: string | null;
  author: BlogAuthor | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /admin/blog/posts`. Newest edit first. */
export interface AdminBlogPostListResponse {
  items: AdminBlogPost[];
  page: number;
  pageSize: number;
  total: number;
}

/** A category on the public site, in the requested language. */
export interface PublicBlogCategory {
  slug: string;
  name: string;
  /** Visible posts in this language. */
  postCount: number;
}

/** An author byline on the public site, in the requested language. */
export interface PublicBlogAuthor {
  name: string;
  photoUrl: string | null;
  bio: string | null;
}

/**
 * `GET /platform/blog/posts/:slug?lang=` — one visible post, flattened to the
 * requested language. `metaTitle` / `metaDescription` are the stored SEO values
 * (null when unset — the site falls back to `title` / `excerpt`).
 */
export interface PublicBlogPost {
  id: string;
  slug: string;
  lang: BlogLang;
  title: string;
  excerpt: string | null;
  contentHtml: string;
  coverImageUrl: string | null;
  ogImageUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  tags: string[];
  category: { slug: string; name: string } | null;
  author: PublicBlogAuthor | null;
  publishAt: string;
  updatedAt: string;
  availableLangs: BlogLang[];
}

/** A listing card: everything but the body, which a list never needs. */
export type PublicBlogPostSummary = Omit<PublicBlogPost, 'contentHtml'>;

/** `GET /platform/blog/posts` — newest `publishAt` first. */
export interface PublicBlogPostListResponse {
  items: PublicBlogPostSummary[];
  page: number;
  pageSize: number;
  total: number;
}

/** `GET /platform/blog/categories?lang=`. */
export interface PublicBlogCategoryListResponse {
  items: PublicBlogCategory[];
}

/** `GET /platform/blog/tags?lang=` — tags on visible posts, most used first. */
export interface PublicBlogTagListResponse {
  items: { tag: string; count: number }[];
}

/** One visible post for the sitemap and RSS feeds. */
export interface PublicBlogIndexEntry {
  slug: string;
  langs: BlogLang[];
  publishAt: string;
  updatedAt: string;
}

/** `GET /platform/blog/index`. */
export interface PublicBlogIndexResponse {
  items: PublicBlogIndexEntry[];
}

/** `409` body `code` when a slug is already used by another post or category. */
export const BLOG_SLUG_TAKEN_CODE = 'SLUG_TAKEN';
