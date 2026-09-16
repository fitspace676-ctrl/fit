import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { MediaCleanupService } from '../storage/media-cleanup.service';
import type { StorageService } from '../storage/storage.service';
import { AdminBannersService } from './admin-banners.service';

type Args = Record<string, unknown>;

const row = {
  id: 'banner-1',
  gymId: 'gym-1',
  title: 'Summer offer',
  imageUrl: 'https://cdn/summer.jpg',
  linkUrl: '/shop',
  sortOrder: 0,
  isActive: true,
  startsAt: null as Date | null,
  endsAt: null as Date | null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-02T00:00:00.000Z'),
};

function setup(over: { current?: typeof row | null; rows?: unknown[] } = {}) {
  const findMany = vi.fn<(args?: Args) => Promise<unknown[]>>(() =>
    Promise.resolve(over.rows ?? [row]),
  );
  const findFirst = vi.fn<(args: Args) => Promise<unknown>>(() =>
    Promise.resolve(over.current === undefined ? row : over.current),
  );
  const create = vi.fn<(args: Args) => Promise<unknown>>((args) =>
    Promise.resolve({ ...row, ...(args.data as Args) }),
  );
  const update = vi.fn<(args: Args) => Promise<unknown>>((args) =>
    Promise.resolve({ ...row, ...(args.data as Args) }),
  );
  const del = vi.fn<(args: Args) => Promise<unknown>>(() => Promise.resolve(row));
  const $transaction = vi.fn<(ops: unknown[]) => Promise<unknown[]>>((ops) =>
    Promise.all(ops as Promise<unknown>[]),
  );

  const prisma = {
    client: { banner: { findMany, findFirst, create, update, delete: del }, $transaction },
  } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;
  const publicUrl = vi.fn<(key: string) => string | null>(
    (key) => `https://pub-test.r2.dev/${key}`,
  );
  const storage = { publicUrl } as unknown as StorageService;
  const discardUnreferenced = vi.fn(() => Promise.resolve());
  const media = { discardUnreferenced } as unknown as MediaCleanupService;

  return {
    service: new AdminBannersService(prisma, tenant, storage, media),
    findMany,
    findFirst,
    create,
    update,
    del,
    $transaction,
    publicUrl,
    discardUnreferenced,
  };
}

describe('AdminBannersService.listBanners', () => {
  it('returns every banner in carousel order, wire-shaped', async () => {
    const { service, findMany } = setup();

    const result = await service.listBanners();

    expect(findMany).toHaveBeenCalledWith({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    expect(result.banners[0]).toEqual({
      id: 'banner-1',
      gymId: 'gym-1',
      title: 'Summer offer',
      imageUrl: 'https://cdn/summer.jpg',
      linkUrl: '/shop',
      sortOrder: 0,
      isActive: true,
      startsAt: null,
      endsAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    });
  });

  it('never filters by gymId itself — the tenant extension owns that', async () => {
    const { service, findMany } = setup();

    await service.listBanners();

    expect(JSON.stringify(findMany.mock.calls[0]?.[0] ?? {})).not.toContain('gymId');
  });
});

describe('AdminBannersService.createBanner', () => {
  it('creates a draft with an empty imageUrl — artwork is finalised separately', async () => {
    const { service, create } = setup({ rows: [] });

    await service.createBanner({ isActive: true });

    expect((create.mock.calls[0]?.[0]?.data as Args).imageUrl).toBe('');
  });

  it('appends: an omitted sortOrder lands one past the highest in use', async () => {
    const { service, create, findFirst } = setup();
    findFirst.mockResolvedValueOnce({ sortOrder: 4 });

    await service.createBanner({ isActive: true });

    expect((create.mock.calls[0]?.[0]?.data as Args).sortOrder).toBe(5);
  });

  it('starts the first banner of a gym at position 0', async () => {
    const { service, create, findFirst } = setup();
    findFirst.mockResolvedValueOnce(null);

    await service.createBanner({ isActive: true });

    expect((create.mock.calls[0]?.[0]?.data as Args).sortOrder).toBe(0);
  });

  it('honours an explicit sortOrder without probing for the last one', async () => {
    const { service, create, findFirst } = setup();

    await service.createBanner({ isActive: true, sortOrder: 2 });

    expect(findFirst).not.toHaveBeenCalled();
    expect((create.mock.calls[0]?.[0]?.data as Args).sortOrder).toBe(2);
  });

  it('stores the schedule window as dates', async () => {
    const { service, create } = setup();

    await service.createBanner({
      isActive: true,
      sortOrder: 0,
      startsAt: '2026-09-10T00:00:00.000Z',
      endsAt: '2026-09-20T00:00:00.000Z',
    });

    const data = create.mock.calls[0]?.[0]?.data as Args;
    expect(data.startsAt).toEqual(new Date('2026-09-10T00:00:00.000Z'));
    expect(data.endsAt).toEqual(new Date('2026-09-20T00:00:00.000Z'));
  });
});

describe('AdminBannersService.updateBanner', () => {
  it('patches only the keys present', async () => {
    const { service, update } = setup();

    await service.updateBanner('banner-1', { isActive: false });

    expect(update.mock.calls[0]?.[0]?.data).toEqual({ isActive: false });
  });

  it('clears a nullable field when the patch sends null', async () => {
    const { service, update } = setup();

    await service.updateBanner('banner-1', { linkUrl: null });

    expect(update.mock.calls[0]?.[0]?.data).toEqual({ linkUrl: null });
  });

  it('rejects a one-sided patch that would close the window before it opens', async () => {
    // The check the schema cannot make: `startsAt` lives on the stored row, and
    // moving one end alone is the common edit.
    const { service, update } = setup({
      current: { ...row, startsAt: new Date('2026-09-10T00:00:00.000Z') },
    });

    const error = await service
      .updateBanner('banner-1', { endsAt: '2026-09-01T00:00:00.000Z' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('accepts a one-sided patch that leaves a valid window', async () => {
    const { service, update } = setup({
      current: { ...row, startsAt: new Date('2026-09-10T00:00:00.000Z') },
    });

    await service.updateBanner('banner-1', { endsAt: '2026-09-20T00:00:00.000Z' });

    expect(update).toHaveBeenCalled();
  });

  it('frees the replaced image when the artwork URL changes', async () => {
    const { service, discardUnreferenced } = setup();

    await service.updateBanner('banner-1', { imageUrl: 'https://cdn/autumn.jpg' });

    expect(discardUnreferenced).toHaveBeenCalledWith(
      ['https://cdn/summer.jpg'],
      ['https://cdn/autumn.jpg'],
    );
  });

  it('leaves the image alone when the patch does not mention it', async () => {
    const { service, discardUnreferenced } = setup();

    await service.updateBanner('banner-1', { title: 'New title' });

    expect(discardUnreferenced).not.toHaveBeenCalled();
  });

  it('404s on an unknown or cross-tenant id', async () => {
    const { service, update } = setup({ current: null });

    const error = await service.updateBanner('nope', { title: 'x' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('AdminBannersService.deleteBanner', () => {
  it('deletes the row and frees its image', async () => {
    const { service, del, discardUnreferenced } = setup();

    await service.deleteBanner('banner-1');

    expect(del).toHaveBeenCalledWith({ where: { id: 'banner-1' } });
    expect(discardUnreferenced).toHaveBeenCalledWith(['https://cdn/summer.jpg'], []);
  });

  it('404s on a miss without deleting anything', async () => {
    const { service, del } = setup({ current: null });

    const error = await service.deleteBanner('nope').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(del).not.toHaveBeenCalled();
  });
});

describe('AdminBannersService.setImage', () => {
  it('stores the public URL of the uploaded key and frees the previous image', async () => {
    const { service, update, discardUnreferenced } = setup();

    const result = await service.setImage('banner-1', { photoKey: 'gym-1/banners/new.jpg' });

    expect(update.mock.calls[0]?.[0]?.data).toEqual({
      imageUrl: 'https://pub-test.r2.dev/gym-1/banners/new.jpg',
    });
    expect(discardUnreferenced).toHaveBeenCalledWith(
      ['https://cdn/summer.jpg'],
      ['https://pub-test.r2.dev/gym-1/banners/new.jpg'],
    );
    expect(result.banner.imageUrl).toBe('https://pub-test.r2.dev/gym-1/banners/new.jpg');
  });

  it("400s a key under another gym's prefix", async () => {
    const { service, update } = setup();

    const error = await service
      .setImage('banner-1', { photoKey: 'gym-2/banners/stolen.jpg' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('503s when R2 has no public base URL configured', async () => {
    const { service, publicUrl, update } = setup();
    publicUrl.mockReturnValueOnce(null);

    const error = await service
      .setImage('banner-1', { photoKey: 'gym-1/banners/new.jpg' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('AdminBannersService.reorderBanners', () => {
  it('writes each id its index, in one transaction', async () => {
    const { service, findMany, update, $transaction } = setup();
    findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);

    await service.reorderBanners({ ids: ['b', 'a'] });

    expect($transaction).toHaveBeenCalled();
    expect(update.mock.calls.map((c) => c[0])).toEqual([
      { where: { id: 'b' }, data: { sortOrder: 0 } },
      { where: { id: 'a' }, data: { sortOrder: 1 } },
    ]);
  });

  it('404s — writing nothing — when an id is unknown or belongs to another gym', async () => {
    const { service, findMany, update } = setup();
    findMany.mockResolvedValueOnce([{ id: 'a' }]);

    const error = await service.reorderBanners({ ids: ['a', 'ghost'] }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });
});
