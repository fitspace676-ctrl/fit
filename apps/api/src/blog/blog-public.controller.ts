import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  blogLangQuerySchema,
  blogSlugSchema,
  listPublicBlogPostsQuerySchema,
  type PublicBlogCategoryListResponse,
  type PublicBlogIndexResponse,
  type PublicBlogPost,
  type PublicBlogPostListResponse,
  type PublicBlogTagListResponse,
} from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { BlogPublicService } from './blog-public.service';
import { parse } from './parse';

/**
 * The formacore.io blog's read API (`/platform/blog/*`).
 *
 * `@Public()` and tenant-less: the marketing site calls it without a session, and
 * `platform/(.*)` is excluded from the tenant middleware in `AppModule`. Read-only,
 * and only ever returns visible posts — see {@link BlogPublicService}.
 */
@Public()
@Controller('platform/blog')
export class BlogPublicController {
  constructor(private readonly blog: BlogPublicService) {}

  /** `GET /platform/blog/posts?lang=&category=&tag=&page=&pageSize=` */
  @Get('posts')
  listPosts(@Query() query: unknown): Promise<PublicBlogPostListResponse> {
    return this.blog.listPosts(parse(listPublicBlogPostsQuerySchema, query));
  }

  /** `GET /platform/blog/posts/:slug?lang=` — `404` unless visible in that language. */
  @Get('posts/:slug')
  getPost(@Param('slug') slug: string, @Query() query: unknown): Promise<PublicBlogPost> {
    const { lang } = parse(blogLangQuerySchema, query);
    return this.blog.getPost(parse(blogSlugSchema, slug), lang);
  }

  /** `GET /platform/blog/categories?lang=` — categories with visible posts. */
  @Get('categories')
  listCategories(@Query() query: unknown): Promise<PublicBlogCategoryListResponse> {
    return this.blog.listCategories(parse(blogLangQuerySchema, query).lang);
  }

  /** `GET /platform/blog/tags?lang=` — tags on visible posts, most used first. */
  @Get('tags')
  listTags(@Query() query: unknown): Promise<PublicBlogTagListResponse> {
    return this.blog.listTags(parse(blogLangQuerySchema, query).lang);
  }

  /** `GET /platform/blog/index` — every visible post, for the sitemap and RSS. */
  @Get('index')
  index(): Promise<PublicBlogIndexResponse> {
    return this.blog.index();
  }
}
