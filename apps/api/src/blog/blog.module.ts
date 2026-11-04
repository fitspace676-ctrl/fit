import { Module } from '@nestjs/common';
import { BlogAdminController } from './blog-admin.controller';
import { BlogPublicController } from './blog-public.controller';
import { BlogPublicService } from './blog-public.service';
import { BlogService } from './blog.service';

/**
 * The platform blog: superadmin management under `/admin/blog` and the public
 * read API under `/platform/blog` for formacore.io.
 *
 * Platform-level, like `PlatformModule`: no blog model is tenant-scoped. The
 * unscoped `PrismaService`, `StorageService` (from the `@Global` `StorageModule`)
 * and the `TenantContext` / `TenantGuard` (global `TenantModule`) need no import.
 */
@Module({
  controllers: [BlogAdminController, BlogPublicController],
  providers: [BlogService, BlogPublicService],
})
export class BlogModule {}
