import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createBlogAuthorSchema,
  createBlogCategorySchema,
  createBlogPostSchema,
  createBlogUploadSchema,
  listAdminBlogPostsQuerySchema,
  publishBlogPostSchema,
  updateBlogAuthorSchema,
  updateBlogCategorySchema,
  updateBlogPostSchema,
  type AdminBlogPost,
  type AdminBlogPostListResponse,
  type BlogAuthor,
  type BlogAuthorListResponse,
  type BlogCategory,
  type BlogCategoryListResponse,
} from '@fit/types';
import { AllowCrossTenant } from '../common/decorators/allow-cross-tenant.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import type { SignedUpload } from '../storage/storage.service';
import { BlogService } from './blog.service';
import { parse } from './parse';

/**
 * Superadmin management of the platform blog (`/admin/blog/*`).
 *
 * The blog belongs to no gym, so every route is `@AllowCrossTenant()` behind
 * {@link TenantGuard}, which honours that decorator only for a `SUPER_ADMIN` and
 * answers everyone else `403` — the same gate as `/admin/gyms`, and the only one:
 * the blog models are not tenant-scoped, so nothing else would stop a gym owner.
 */
@Controller('admin/blog')
@UseGuards(TenantGuard)
export class BlogAdminController {
  constructor(private readonly blog: BlogService) {}

  /** `GET /admin/blog/posts?status=&lang=&q=&page=&pageSize=` — newest edit first. */
  @Get('posts')
  @AllowCrossTenant()
  listPosts(@Query() query: unknown): Promise<AdminBlogPostListResponse> {
    return this.blog.listPosts(parse(listAdminBlogPostsQuerySchema, query));
  }

  /** `POST /admin/blog/posts` — create a draft. `409 SLUG_TAKEN` on a used slug. */
  @Post('posts')
  @HttpCode(HttpStatus.CREATED)
  @AllowCrossTenant()
  createPost(@Body() body: unknown): Promise<AdminBlogPost> {
    return this.blog.createPost(parse(createBlogPostSchema, body));
  }

  @Get('posts/:id')
  @AllowCrossTenant()
  getPost(@Param('id') id: string): Promise<AdminBlogPost> {
    return this.blog.getPost(id);
  }

  @Patch('posts/:id')
  @AllowCrossTenant()
  updatePost(@Param('id') id: string, @Body() body: unknown): Promise<AdminBlogPost> {
    return this.blog.updatePost(id, parse(updateBlogPostSchema, body));
  }

  @Delete('posts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowCrossTenant()
  deletePost(@Param('id') id: string): Promise<void> {
    return this.blog.deletePost(id);
  }

  /** `POST /admin/blog/posts/:id/publish` — `{ publishAt? }`; omitted means now. */
  @Post('posts/:id/publish')
  @HttpCode(HttpStatus.OK)
  @AllowCrossTenant()
  publishPost(@Param('id') id: string, @Body() body: unknown): Promise<AdminBlogPost> {
    return this.blog.publishPost(id, parse(publishBlogPostSchema, body ?? {}));
  }

  /** `POST /admin/blog/posts/:id/unpublish` — back to draft. */
  @Post('posts/:id/unpublish')
  @HttpCode(HttpStatus.OK)
  @AllowCrossTenant()
  unpublishPost(@Param('id') id: string): Promise<AdminBlogPost> {
    return this.blog.unpublishPost(id);
  }

  @Get('categories')
  @AllowCrossTenant()
  listCategories(): Promise<BlogCategoryListResponse> {
    return this.blog.listCategories();
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  @AllowCrossTenant()
  createCategory(@Body() body: unknown): Promise<BlogCategory> {
    return this.blog.createCategory(parse(createBlogCategorySchema, body));
  }

  @Patch('categories/:id')
  @AllowCrossTenant()
  updateCategory(@Param('id') id: string, @Body() body: unknown): Promise<BlogCategory> {
    return this.blog.updateCategory(id, parse(updateBlogCategorySchema, body));
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowCrossTenant()
  deleteCategory(@Param('id') id: string): Promise<void> {
    return this.blog.deleteCategory(id);
  }

  @Get('authors')
  @AllowCrossTenant()
  listAuthors(): Promise<BlogAuthorListResponse> {
    return this.blog.listAuthors();
  }

  @Post('authors')
  @HttpCode(HttpStatus.CREATED)
  @AllowCrossTenant()
  createAuthor(@Body() body: unknown): Promise<BlogAuthor> {
    return this.blog.createAuthor(parse(createBlogAuthorSchema, body));
  }

  @Patch('authors/:id')
  @AllowCrossTenant()
  updateAuthor(@Param('id') id: string, @Body() body: unknown): Promise<BlogAuthor> {
    return this.blog.updateAuthor(id, parse(updateBlogAuthorSchema, body));
  }

  @Delete('authors/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowCrossTenant()
  deleteAuthor(@Param('id') id: string): Promise<void> {
    return this.blog.deleteAuthor(id);
  }

  /**
   * `POST /admin/blog/uploads` — `{ contentType, contentLength, fileName? }` →
   * a presigned PUT under `platform/blog/`. Raster images only.
   */
  @Post('uploads')
  @HttpCode(HttpStatus.CREATED)
  @AllowCrossTenant()
  createUpload(@Body() body: unknown): Promise<SignedUpload> {
    return this.blog.createUpload(parse(createBlogUploadSchema, body));
  }
}
