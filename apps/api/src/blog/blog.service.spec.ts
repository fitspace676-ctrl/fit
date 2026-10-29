import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BlogPostStatus, Prisma } from '@fit/db';
import { createBlogPostSchema, updateBlogPostSchema } from '@fit/types';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { BlogService } from './blog.service';
import type { PostRecord } from './blog-mapping';

const IMG = 'https://media.formacore.io/platform/blog/a.png';
const OTHER_IMG = 'https://media.formacore.io/platform/blog/b.png';
const FOREIGN_IMG = 'https://media.formacore.io/gym-1/products/x.png';

function postRow(overrides: Partial<PostRecord> = {}): PostRecord {
  const at = new Date('2026-10-01T10:00:00.000Z');
  return {
    id: 'post-1',
    slug: 'hello',
    status: BlogPostStatus.DRAFT,
    publishAt: null,
    titleKa: 'გამარჯობა',
    excerptKa: null,
    contentHtmlKa: '',
    metaTitleKa: null,
    metaDescriptionKa: null,
    titleEn: null,
    excerptEn: null,
    contentHtmlEn: null,
    metaTitleEn: null,
    metaDescriptionEn: null,
    coverImageUrl: null,
    ogImageUrl: null,
    contentImageUrls: [],
    tags: [],
    categoryId: null,
    category: null,
    authorId: null,
    author: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: '6' });
}

/** Echo the write's `data` back onto a row, the way Prisma would. */
function echo(base: PostRecord) {
  return (args: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...base, ...args.data } as PostRecord);
}

function setup(existing: PostRecord | null = postRow()) {
  const post = {
    findUnique: vi.fn(() => Promise.resolve(existing)),
    findMany: vi.fn((_args: unknown) => Promise.resolve(existing ? [existing] : [])),
    count: vi.fn(() => Promise.resolve(existing ? 1 : 0)),
    create: vi.fn(echo(postRow())),
    update: vi.fn(echo(existing ?? postRow())),
    delete: vi.fn(() => Promise.resolve(existing)),
  };
  const category = {
    findUnique: vi.fn(() => Promise.resolve({ id: 'cat-1' })),
    findMany: vi.fn(() => Promise.resolve([])),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const author = {
    findUnique: vi.fn(() => Promise.resolve({ id: 'author-1', photoUrl: null })),
    findMany: vi.fn(() => Promise.resolve([])),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const prisma = {
    client: { blogPost: post, blogCategory: category, blogAuthor: author },
  } as unknown as PrismaService;
  const createSignedUpload = vi.fn(() => Promise.resolve({ key: 'platform/blog/k.png' }));
  const storage = { createSignedUpload } as unknown as StorageService;
  return { service: new BlogService(prisma, storage), post, category, author, createSignedUpload };
}

describe('BlogService posts', () => {
  it('creates a sanitized DRAFT and records the images left in its content', async () => {
    const { service, post } = setup();
    const body = createBlogPostSchema.parse({
      slug: 'hello',
      titleKa: 'გამარჯობა',
      contentHtmlKa: `<p onclick="x()">hi</p><script>bad()</script><img src="${IMG}" />`,
      contentHtmlEn: `<img src="${OTHER_IMG}" /><img src="data:image/png;base64,AAAA" />`,
      titleEn: 'Hello',
      coverImageUrl: IMG,
      tags: ['News'],
    });

    const created = await service.createPost(body);

    const data = post.create.mock.calls[0]![0].data;
    expect(data.status).toBe(BlogPostStatus.DRAFT);
    expect(data.contentHtmlKa).toBe(`<p>hi</p><img src="${IMG}" />`);
    expect(data.contentImageUrls).toEqual([IMG, OTHER_IMG]);
    expect(data.tags).toEqual(['news']);
    expect(created.visibility).toBe('draft');
    expect(created.availableLangs).toEqual(['ka', 'en']);
  });

  it('reports English as unavailable without an English title', async () => {
    const { service } = setup(postRow({ titleEn: null, contentHtmlEn: '<p>orphan</p>' }));
    expect((await service.getPost('post-1')).availableLangs).toEqual(['ka']);
  });

  it('answers 409 SLUG_TAKEN when the slug is already used', async () => {
    const { service, post } = setup();
    post.create.mockRejectedValueOnce(prismaError('P2002'));
    const error = await service
      .createPost(createBlogPostSchema.parse({ slug: 'hello', titleKa: 'x' }))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'SLUG_TAKEN' });
  });

  it('refuses media outside platform/ with 400 MEDIA_NOT_OWNED', async () => {
    const { service, post } = setup();
    const error = await service
      .createPost(
        createBlogPostSchema.parse({ slug: 'hello', titleKa: 'x', coverImageUrl: FOREIGN_IMG }),
      )
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'MEDIA_NOT_OWNED',
    });
    expect(post.create).not.toHaveBeenCalled();
  });

  it('refuses an unknown category with 400', async () => {
    const { service, category } = setup();
    category.findUnique.mockResolvedValueOnce(null as never);
    await expect(
      service.createPost(createBlogPostSchema.parse({ slug: 'a', titleKa: 'x', categoryId: 'no' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update keeps an already-stored foreign reference but refuses a new one', async () => {
    const { service, post } = setup(postRow({ coverImageUrl: FOREIGN_IMG }));
    await service.updatePost('post-1', updateBlogPostSchema.parse({ coverImageUrl: FOREIGN_IMG }));
    expect(post.update).toHaveBeenCalledTimes(1);

    await expect(
      service.updatePost(
        'post-1',
        updateBlogPostSchema.parse({ ogImageUrl: 'https://media.formacore.io/gym-2/logos/l.png' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update re-sanitizes only the bodies it is given and recomputes images from both', async () => {
    const { service, post } = setup(
      postRow({ contentHtmlKa: `<img src="${IMG}" />`, contentImageUrls: [IMG] }),
    );
    await service.updatePost(
      'post-1',
      updateBlogPostSchema.parse({ contentHtmlEn: `<img src="${OTHER_IMG}" /><iframe></iframe>` }),
    );
    const data = post.update.mock.calls[0]![0].data;
    expect(data.contentHtmlKa).toBeUndefined();
    expect(data.contentHtmlEn).toBe(`<img src="${OTHER_IMG}" />`);
    expect(data.contentImageUrls).toEqual([IMG, OTHER_IMG]);
  });

  it('update answers 404 for an unknown post and 409 for a taken slug', async () => {
    await expect(setup(null).service.updatePost('nope', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const { service, post } = setup();
    post.update.mockRejectedValueOnce(prismaError('P2002'));
    await expect(service.updatePost('post-1', { slug: 'taken' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('publishes now when no publishAt is given', async () => {
    const { service, post } = setup();
    const before = Date.now();
    const published = await service.publishPost('post-1', {});
    const data = post.update.mock.calls[0]![0].data as { status: string; publishAt: Date };
    expect(data.status).toBe(BlogPostStatus.PUBLISHED);
    expect(data.publishAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(published.visibility).toBe('published');
  });

  it('schedules when publishAt is in the future', async () => {
    const { service, post } = setup();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const scheduled = await service.publishPost('post-1', { publishAt: future });
    const data = post.update.mock.calls[0]![0].data as { publishAt: Date };
    expect(data.publishAt.toISOString()).toBe(future);
    expect(scheduled.visibility).toBe('scheduled');
  });

  it('unpublish returns the post to DRAFT', async () => {
    const { service, post } = setup(
      postRow({ status: BlogPostStatus.PUBLISHED, publishAt: new Date() }),
    );
    const draft = await service.unpublishPost('post-1');
    expect(post.update.mock.calls[0]![0].data).toEqual({
      status: BlogPostStatus.DRAFT,
      publishAt: null,
    });
    expect(draft.visibility).toBe('draft');
  });

  it('publish and unpublish answer 404 for an unknown post', async () => {
    const { service, post } = setup(null);
    await expect(service.publishPost('nope', {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.unpublishPost('nope')).rejects.toBeInstanceOf(NotFoundException);
    expect(post.update).not.toHaveBeenCalled();
  });

  it('deletes, and maps a missing row to 404', async () => {
    const { service, post } = setup();
    await service.deletePost('post-1');
    expect(post.delete).toHaveBeenCalledWith({ where: { id: 'post-1' } });
    post.delete.mockRejectedValueOnce(prismaError('P2025'));
    await expect(service.deletePost('gone')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists with status, English-only and search filters', async () => {
    const { service, post } = setup();
    const result = await service.listPosts({
      status: 'PUBLISHED',
      lang: 'en',
      q: 'gym',
      page: 2,
      pageSize: 10,
    });
    const args = post.findMany.mock.calls[0]![0] as {
      where: { AND: unknown[] };
      skip: number;
      take: number;
    };
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(args.where.AND).toEqual(
      expect.arrayContaining([
        { status: 'PUBLISHED' },
        { titleEn: { not: null } },
        { titleEn: { not: '' } },
      ]),
    );
    expect(result).toMatchObject({ page: 2, pageSize: 10, total: 1 });
  });
});

describe('BlogService categories, authors, uploads', () => {
  it('maps a duplicate category slug to 409 SLUG_TAKEN', async () => {
    const { service, category } = setup();
    category.create.mockRejectedValueOnce(prismaError('P2002'));
    await expect(
      service.createCategory({ slug: 'news', nameKa: 'სიახლეები', nameEn: 'News' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('deleting an unknown category is a 404', async () => {
    const { service, category } = setup();
    category.delete.mockRejectedValueOnce(prismaError('P2025'));
    await expect(service.deleteCategory('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a foreign author photo', async () => {
    const { service, author } = setup();
    await expect(service.createAuthor({ name: 'Nino', photoUrl: FOREIGN_IMG })).rejects.toThrow(
      BadRequestException,
    );
    expect(author.create).not.toHaveBeenCalled();
  });

  it('mints uploads under platform/blog/', async () => {
    const { service, createSignedUpload } = setup();
    await service.createUpload({ contentType: 'image/png', contentLength: 10, fileName: 'a.png' });
    expect(createSignedUpload).toHaveBeenCalledWith({
      gymId: 'platform',
      entity: 'blog',
      contentType: 'image/png',
      contentLength: 10,
      fileName: 'a.png',
    });
  });
});
