import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { Role } from '@fit/db';
import type { NextFunction, Request, Response } from 'express';
import { loggerConfig } from '../common/logging';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { TenantContext, tenantStorage, type TenantState } from '../common/tenant/tenant.context';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { BlogAdminController } from './blog-admin.controller';
import { BlogPublicController } from './blog-public.controller';
import { BlogPublicService } from './blog-public.service';
import { BlogService } from './blog.service';

/**
 * Proves the blog's authorization contract over real HTTP: every `/admin/blog`
 * route is SUPER_ADMIN-only (everyone else `403`), while `/platform/blog` answers
 * a caller with no session at all.
 *
 * As in `superadmin.authz.integration.spec.ts`, a test middleware stands in for
 * the real `TenantMiddleware`, opening the tenant ALS store from `x-test-*`
 * headers. Services are stubs: this asserts the gate, not the data path.
 */
describe('Blog authorization (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;

  const empty = { items: [], page: 1, pageSize: 20, total: 0 };
  const adminStub = {
    listPosts: () => Promise.resolve(empty),
    createPost: () => Promise.resolve({ id: 'post-1' }),
    getPost: (id: string) => Promise.resolve({ id }),
    updatePost: (id: string) => Promise.resolve({ id }),
    deletePost: () => Promise.resolve(),
    publishPost: (id: string) => Promise.resolve({ id }),
    unpublishPost: (id: string) => Promise.resolve({ id }),
    listCategories: () => Promise.resolve({ items: [] }),
    createCategory: () => Promise.resolve({ id: 'cat-1' }),
    updateCategory: (id: string) => Promise.resolve({ id }),
    deleteCategory: () => Promise.resolve(),
    listAuthors: () => Promise.resolve({ items: [] }),
    createAuthor: () => Promise.resolve({ id: 'a-1' }),
    updateAuthor: (id: string) => Promise.resolve({ id }),
    deleteAuthor: () => Promise.resolve(),
    createUpload: () => Promise.resolve({ key: 'platform/blog/k.png' }),
  };
  const publicStub = {
    listPosts: () => Promise.resolve({ ...empty, pageSize: 12 }),
    getPost: (slug: string, lang: string) => Promise.resolve({ slug, lang }),
    listCategories: () => Promise.resolve({ items: [] }),
    listTags: () => Promise.resolve({ items: [] }),
    index: () => Promise.resolve({ items: [] }),
  };

  /** Every admin route with a body that passes validation. */
  const ADMIN_ROUTES: { method: string; path: string; body?: unknown }[] = [
    { method: 'GET', path: '/admin/blog/posts' },
    { method: 'POST', path: '/admin/blog/posts', body: { slug: 'a', titleKa: 'ა' } },
    { method: 'GET', path: '/admin/blog/posts/p1' },
    { method: 'PATCH', path: '/admin/blog/posts/p1', body: {} },
    { method: 'DELETE', path: '/admin/blog/posts/p1' },
    { method: 'POST', path: '/admin/blog/posts/p1/publish', body: {} },
    { method: 'POST', path: '/admin/blog/posts/p1/unpublish' },
    { method: 'GET', path: '/admin/blog/categories' },
    {
      method: 'POST',
      path: '/admin/blog/categories',
      body: { slug: 'n', nameKa: 'ა', nameEn: 'a' },
    },
    { method: 'PATCH', path: '/admin/blog/categories/c1', body: {} },
    { method: 'DELETE', path: '/admin/blog/categories/c1' },
    { method: 'GET', path: '/admin/blog/authors' },
    { method: 'POST', path: '/admin/blog/authors', body: { name: 'N' } },
    { method: 'PATCH', path: '/admin/blog/authors/a1', body: {} },
    { method: 'DELETE', path: '/admin/blog/authors/a1' },
    {
      method: 'POST',
      path: '/admin/blog/uploads',
      body: { contentType: 'image/png', contentLength: 10 },
    },
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LoggerModule.forRoot(loggerConfig())],
      controllers: [BlogAdminController, BlogPublicController],
      providers: [
        TenantContext,
        TenantGuard,
        { provide: BlogService, useValue: adminStub },
        { provide: BlogPublicService, useValue: publicStub },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const roleHeader = req.headers['x-test-role'];
      if (typeof roleHeader !== 'string') {
        next();
        return;
      }
      const state: TenantState = {
        userId: (req.headers['x-test-user'] as string | undefined) ?? 'user-1',
        gymId: (req.headers['x-test-gym'] as string | undefined) ?? null,
        role: roleHeader as Role,
        allowCrossTenant: false,
      };
      tenantStorage.run(state, () => next());
    });
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  function call(
    route: { method: string; path: string; body?: unknown },
    headers: Record<string, string>,
  ) {
    return fetch(`${baseUrl}${route.path}`, {
      method: route.method,
      headers: { 'content-type': 'application/json', ...headers },
      body: route.body === undefined ? undefined : JSON.stringify(route.body),
    });
  }

  it('lets a SUPER_ADMIN reach every admin route', async () => {
    for (const route of ADMIN_ROUTES) {
      const res = await call(route, { 'x-test-role': Role.SUPER_ADMIN, 'x-test-user': 'admin-1' });
      expect([200, 201, 204], `${route.method} ${route.path}`).toContain(res.status);
    }
  });

  it('forbids a gym OWNER on every admin route (403)', async () => {
    for (const route of ADMIN_ROUTES) {
      const res = await call(route, {
        'x-test-role': Role.OWNER,
        'x-test-user': 'owner-1',
        'x-test-gym': 'gym-1',
      });
      expect(res.status, `${route.method} ${route.path}`).toBe(403);
    }
  });

  it('forbids MANAGER and MEMBER too', async () => {
    for (const role of [Role.MANAGER, Role.MEMBER]) {
      const res = await call(ADMIN_ROUTES[1]!, { 'x-test-role': role, 'x-test-gym': 'gym-1' });
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code: string }).code).toBe('CROSS_TENANT_FORBIDDEN');
    }
  });

  it('refuses an anonymous caller on admin routes', async () => {
    const res = await call(ADMIN_ROUTES[0]!, {});
    expect([401, 403]).toContain(res.status);
  });

  it('serves the public routes without any session', async () => {
    for (const path of [
      '/platform/blog/posts?lang=ka',
      '/platform/blog/posts/hello?lang=en',
      '/platform/blog/categories?lang=en',
      '/platform/blog/tags',
      '/platform/blog/index',
    ]) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status, path).toBe(200);
    }
  });

  it('validates public query parameters (400)', async () => {
    expect((await fetch(`${baseUrl}/platform/blog/posts?lang=fr`)).status).toBe(400);
    expect((await fetch(`${baseUrl}/platform/blog/posts?pageSize=51`)).status).toBe(400);
    expect((await fetch(`${baseUrl}/platform/blog/posts/Bad%20Slug`)).status).toBe(400);
  });
});
