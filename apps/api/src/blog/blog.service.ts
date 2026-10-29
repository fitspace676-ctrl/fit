import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BlogPostStatus, Prisma } from '@fit/db';
import {
  BLOG_SLUG_TAKEN_CODE,
  type AdminBlogPost,
  type AdminBlogPostListResponse,
  type BlogAuthor,
  type BlogAuthorListResponse,
  type BlogCategory,
  type BlogCategoryListResponse,
  type CreateBlogAuthorBody,
  type CreateBlogCategoryBody,
  type CreateBlogPostBody,
  type CreateBlogUploadBody,
  type ListAdminBlogPostsQuery,
  type PublishBlogPostBody,
  type UpdateBlogAuthorBody,
  type UpdateBlogCategoryBody,
  type UpdateBlogPostBody,
} from '@fit/types';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { assertOwnedMedia } from '../storage/media-ownership';
import { StorageService, type SignedUpload } from '../storage/storage.service';
import {
  BLOG_MEDIA_ENTITY,
  BLOG_MEDIA_OWNER,
  extractBlogImageUrls,
  sanitizeBlogHtml,
} from './blog-content';
import {
  AUTHOR_INCLUDE,
  CATEGORY_INCLUDE,
  POST_INCLUDE,
  isRecordNotFound,
  isUniqueViolation,
  toAdminPost,
  toAuthor,
  toCategory,
  type PostRecord,
} from './blog-mapping';

/**
 * Superadmin management of the platform blog (`/admin/blog/*`).
 *
 * Blog rows are platform-level — no gym owns them — so this runs on the unscoped
 * {@link PrismaService}; none of the blog models is in `TENANT_SCOPED_MODELS`.
 * Access control is the controller's: `TenantGuard` + `@AllowCrossTenant()`
 * admit a SUPER_ADMIN only.
 *
 * Every write that names media is checked with `assertOwnedMedia('platform', …)`,
 * so a post can only point at images uploaded through `POST /admin/blog/uploads`.
 * Content HTML is sanitized before it is stored, and the images left in it are
 * recorded in `contentImageUrls` so the nightly media sweep keeps them.
 */
@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // --- posts -----------------------------------------------------------------

  async listPosts(query: ListAdminBlogPostsQuery): Promise<AdminBlogPostListResponse> {
    const and: Prisma.BlogPostWhereInput[] = [];
    if (query.status) and.push({ status: query.status });
    if (query.lang === 'en') {
      and.push({ titleEn: { not: null } }, { titleEn: { not: '' } });
    }
    if (query.q) {
      const contains = { contains: query.q, mode: Prisma.QueryMode.insensitive };
      and.push({ OR: [{ titleKa: contains }, { titleEn: contains }, { slug: contains }] });
    }
    const where: Prisma.BlogPostWhereInput = and.length > 0 ? { AND: and } : {};

    const [rows, total] = await Promise.all([
      this.prisma.client.blogPost.findMany({
        where,
        include: POST_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.blogPost.count({ where }),
    ]);
    const now = new Date();
    return {
      items: rows.map((row) => toAdminPost(row, now)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getPost(id: string): Promise<AdminBlogPost> {
    return toAdminPost(await this.requirePost(id), new Date());
  }

  /** Create a DRAFT. `409 SLUG_TAKEN` when another post has the slug. */
  async createPost(body: CreateBlogPostBody): Promise<AdminBlogPost> {
    const contentHtmlKa = this.sanitize(body.contentHtmlKa);
    const contentHtmlEn = body.contentHtmlEn ? this.sanitize(body.contentHtmlEn) : null;
    const contentImageUrls = imagesOf(contentHtmlKa, contentHtmlEn);
    assertOwnedMedia(BLOG_MEDIA_OWNER, [body.coverImageUrl, body.ogImageUrl, ...contentImageUrls]);
    await this.assertRelations(body.categoryId, body.authorId);

    try {
      const row = await this.prisma.client.blogPost.create({
        data: {
          slug: body.slug,
          status: BlogPostStatus.DRAFT,
          titleKa: body.titleKa,
          excerptKa: body.excerptKa ?? null,
          contentHtmlKa,
          metaTitleKa: body.metaTitleKa ?? null,
          metaDescriptionKa: body.metaDescriptionKa ?? null,
          titleEn: body.titleEn ?? null,
          excerptEn: body.excerptEn ?? null,
          contentHtmlEn,
          metaTitleEn: body.metaTitleEn ?? null,
          metaDescriptionEn: body.metaDescriptionEn ?? null,
          coverImageUrl: body.coverImageUrl ?? null,
          ogImageUrl: body.ogImageUrl ?? null,
          contentImageUrls,
          tags: body.tags,
          categoryId: body.categoryId ?? null,
          authorId: body.authorId ?? null,
        },
        include: POST_INCLUDE,
      });
      return toAdminPost(row, new Date());
    } catch (error) {
      throw slugConflictOr(error);
    }
  }

  /** Patch a post; omitted fields stay as they are. Status is not touched here. */
  async updatePost(id: string, body: UpdateBlogPostBody): Promise<AdminBlogPost> {
    const existing = await this.requirePost(id);

    const data: Prisma.BlogPostUncheckedUpdateInput = {};
    if (body.slug !== undefined) data.slug = body.slug;
    if (body.titleKa !== undefined) data.titleKa = body.titleKa;
    if (body.excerptKa !== undefined) data.excerptKa = body.excerptKa;
    if (body.metaTitleKa !== undefined) data.metaTitleKa = body.metaTitleKa;
    if (body.metaDescriptionKa !== undefined) data.metaDescriptionKa = body.metaDescriptionKa;
    if (body.titleEn !== undefined) data.titleEn = body.titleEn;
    if (body.excerptEn !== undefined) data.excerptEn = body.excerptEn;
    if (body.metaTitleEn !== undefined) data.metaTitleEn = body.metaTitleEn;
    if (body.metaDescriptionEn !== undefined) data.metaDescriptionEn = body.metaDescriptionEn;
    if (body.coverImageUrl !== undefined) data.coverImageUrl = body.coverImageUrl;
    if (body.ogImageUrl !== undefined) data.ogImageUrl = body.ogImageUrl;
    if (body.tags !== undefined) data.tags = body.tags;
    if (body.categoryId !== undefined) data.categoryId = body.categoryId;
    if (body.authorId !== undefined) data.authorId = body.authorId;

    let contentHtmlKa = existing.contentHtmlKa;
    let contentHtmlEn = existing.contentHtmlEn;
    if (body.contentHtmlKa !== undefined) {
      contentHtmlKa = this.sanitize(body.contentHtmlKa);
      data.contentHtmlKa = contentHtmlKa;
    }
    if (body.contentHtmlEn !== undefined) {
      contentHtmlEn = body.contentHtmlEn ? this.sanitize(body.contentHtmlEn) : null;
      data.contentHtmlEn = contentHtmlEn;
    }
    const contentImageUrls = imagesOf(contentHtmlKa, contentHtmlEn);
    data.contentImageUrls = contentImageUrls;

    // Only NEW references are held to the ownership rule: what the post already
    // stores passes, so a post saved before a media-host move stays editable.
    assertOwnedMedia(
      BLOG_MEDIA_OWNER,
      [body.coverImageUrl, body.ogImageUrl, ...contentImageUrls],
      [existing.coverImageUrl, existing.ogImageUrl, ...existing.contentImageUrls],
    );
    await this.assertRelations(body.categoryId, body.authorId);

    try {
      const row = await this.prisma.client.blogPost.update({
        where: { id },
        data,
        include: POST_INCLUDE,
      });
      return toAdminPost(row, new Date());
    } catch (error) {
      throw slugConflictOr(error, () => postNotFound());
    }
  }

  /**
   * Publish now (no `publishAt`) or at `publishAt` — a future instant schedules
   * the post, which turns public on its own once the time passes.
   */
  async publishPost(id: string, body: PublishBlogPostBody): Promise<AdminBlogPost> {
    await this.requirePost(id);
    const publishAt = body.publishAt ? new Date(body.publishAt) : new Date();
    const row = await this.prisma.client.blogPost.update({
      where: { id },
      data: { status: BlogPostStatus.PUBLISHED, publishAt },
      include: POST_INCLUDE,
    });
    return toAdminPost(row, new Date());
  }

  /** Take a post (live or scheduled) back to DRAFT and clear its schedule. */
  async unpublishPost(id: string): Promise<AdminBlogPost> {
    await this.requirePost(id);
    const row = await this.prisma.client.blogPost.update({
      where: { id },
      data: { status: BlogPostStatus.DRAFT, publishAt: null },
      include: POST_INCLUDE,
    });
    return toAdminPost(row, new Date());
  }

  /** Hard delete. Its images are left for the nightly media sweep to collect. */
  async deletePost(id: string): Promise<void> {
    try {
      await this.prisma.client.blogPost.delete({ where: { id } });
    } catch (error) {
      if (isRecordNotFound(error)) throw postNotFound();
      throw error;
    }
  }

  // --- categories ------------------------------------------------------------

  async listCategories(): Promise<BlogCategoryListResponse> {
    const rows = await this.prisma.client.blogCategory.findMany({
      include: CATEGORY_INCLUDE,
      orderBy: [{ nameKa: 'asc' }, { id: 'asc' }],
    });
    return { items: rows.map(toCategory) };
  }

  async createCategory(body: CreateBlogCategoryBody): Promise<BlogCategory> {
    try {
      const row = await this.prisma.client.blogCategory.create({
        data: body,
        include: CATEGORY_INCLUDE,
      });
      return toCategory(row);
    } catch (error) {
      throw slugConflictOr(error);
    }
  }

  async updateCategory(id: string, body: UpdateBlogCategoryBody): Promise<BlogCategory> {
    try {
      const row = await this.prisma.client.blogCategory.update({
        where: { id },
        data: body,
        include: CATEGORY_INCLUDE,
      });
      return toCategory(row);
    } catch (error) {
      throw slugConflictOr(error, () => categoryNotFound());
    }
  }

  /** Delete a category; its posts become uncategorised (`onDelete: SetNull`). */
  async deleteCategory(id: string): Promise<void> {
    try {
      await this.prisma.client.blogCategory.delete({ where: { id } });
    } catch (error) {
      if (isRecordNotFound(error)) throw categoryNotFound();
      throw error;
    }
  }

  // --- authors ---------------------------------------------------------------

  async listAuthors(): Promise<BlogAuthorListResponse> {
    const rows = await this.prisma.client.blogAuthor.findMany({
      include: AUTHOR_INCLUDE,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return { items: rows.map(toAuthor) };
  }

  async createAuthor(body: CreateBlogAuthorBody): Promise<BlogAuthor> {
    assertOwnedMedia(BLOG_MEDIA_OWNER, [body.photoUrl]);
    const row = await this.prisma.client.blogAuthor.create({
      data: {
        name: body.name,
        photoUrl: body.photoUrl ?? null,
        bioKa: body.bioKa ?? null,
        bioEn: body.bioEn ?? null,
      },
      include: AUTHOR_INCLUDE,
    });
    return toAuthor(row);
  }

  async updateAuthor(id: string, body: UpdateBlogAuthorBody): Promise<BlogAuthor> {
    const existing = await this.prisma.client.blogAuthor.findUnique({
      where: { id },
      select: { photoUrl: true },
    });
    if (!existing) throw authorNotFound();
    assertOwnedMedia(BLOG_MEDIA_OWNER, [body.photoUrl], [existing.photoUrl]);

    const data: Prisma.BlogAuthorUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.photoUrl !== undefined) data.photoUrl = body.photoUrl;
    if (body.bioKa !== undefined) data.bioKa = body.bioKa;
    if (body.bioEn !== undefined) data.bioEn = body.bioEn;
    try {
      const row = await this.prisma.client.blogAuthor.update({
        where: { id },
        data,
        include: AUTHOR_INCLUDE,
      });
      return toAuthor(row);
    } catch (error) {
      if (isRecordNotFound(error)) throw authorNotFound();
      throw error;
    }
  }

  /** Delete an author; their posts lose the byline (`onDelete: SetNull`). */
  async deleteAuthor(id: string): Promise<void> {
    try {
      await this.prisma.client.blogAuthor.delete({ where: { id } });
    } catch (error) {
      if (isRecordNotFound(error)) throw authorNotFound();
      throw error;
    }
  }

  // --- uploads ---------------------------------------------------------------

  /** A presigned PUT under `platform/blog/` — cover, OG, inline or author photo. */
  createUpload(body: CreateBlogUploadBody): Promise<SignedUpload> {
    return this.storage.createSignedUpload({
      gymId: BLOG_MEDIA_OWNER,
      entity: BLOG_MEDIA_ENTITY,
      contentType: body.contentType,
      contentLength: body.contentLength,
      fileName: body.fileName,
    });
  }

  // --- helpers ---------------------------------------------------------------

  private sanitize(html: string): string {
    return sanitizeBlogHtml(html, env.R2_PUBLIC_URL);
  }

  private async requirePost(id: string): Promise<PostRecord> {
    const row = await this.prisma.client.blogPost.findUnique({
      where: { id },
      include: POST_INCLUDE,
    });
    if (!row) throw postNotFound();
    return row;
  }

  /** `400` when a write names a category or author that does not exist. */
  private async assertRelations(
    categoryId: string | null | undefined,
    authorId: string | null | undefined,
  ): Promise<void> {
    const [category, author] = await Promise.all([
      categoryId
        ? this.prisma.client.blogCategory.findUnique({
            where: { id: categoryId },
            select: { id: true },
          })
        : Promise.resolve({ id: '' }),
      authorId
        ? this.prisma.client.blogAuthor.findUnique({
            where: { id: authorId },
            select: { id: true },
          })
        : Promise.resolve({ id: '' }),
    ]);
    if (!category) {
      throw new BadRequestException({
        code: 'BLOG_CATEGORY_NOT_FOUND',
        message: 'Unknown category',
      });
    }
    if (!author) {
      throw new BadRequestException({ code: 'BLOG_AUTHOR_NOT_FOUND', message: 'Unknown author' });
    }
  }
}

/** Distinct image URLs across both language bodies. */
function imagesOf(ka: string, en: string | null): string[] {
  return [...new Set([...extractBlogImageUrls(ka), ...extractBlogImageUrls(en)])];
}

/** Map a unique violation to `409 SLUG_TAKEN`, a missing row to `notFound()`. */
function slugConflictOr(error: unknown, notFound?: () => Error): unknown {
  if (isUniqueViolation(error)) {
    return new ConflictException({
      code: BLOG_SLUG_TAKEN_CODE,
      message: 'This slug is already in use',
    });
  }
  if (notFound && isRecordNotFound(error)) return notFound();
  return error;
}

function postNotFound(): NotFoundException {
  return new NotFoundException({ code: 'BLOG_POST_NOT_FOUND', message: 'Blog post not found' });
}

function categoryNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'BLOG_CATEGORY_NOT_FOUND',
    message: 'Blog category not found',
  });
}

function authorNotFound(): NotFoundException {
  return new NotFoundException({ code: 'BLOG_AUTHOR_NOT_FOUND', message: 'Blog author not found' });
}
