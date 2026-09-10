import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { BannersService } from './banners.service';

type Args = Record<string, unknown>;

const bannerRow = {
  id: 'banner-1',
  title: 'Summer offer',
  imageUrl: 'https://cdn/summer.jpg',
  linkUrl: '/shop',
};

function setup(rows: unknown[] = [bannerRow]) {
  const findMany = vi.fn<(args: Args) => Promise<unknown[]>>(() => Promise.resolve(rows));
  const prisma = { client: { banner: { findMany } } } as unknown as PrismaService;
  return { service: new BannersService(prisma), findMany };
}

describe('BannersService.listBanners', () => {
  it('returns the four fields a slide draws, in carousel order', async () => {
    const { service, findMany } = setup();

    const result = await service.listBanners({ gymId: 'gym-1' });

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, title: true, imageUrl: true, linkUrl: true },
    });
    expect(result).toEqual({ banners: [bannerRow] });
  });

  it('pins the query to the requested gym — the route has no session', async () => {
    const { service, findMany } = setup();

    await service.listBanners({ gymId: 'gym-2' });

    expect((findMany.mock.calls[0]?.[0]?.where as Args).gymId).toBe('gym-2');
  });

  it('asks only for active banners that have artwork', async () => {
    // The `imageUrl` filter is the one that is easy to forget: the console creates
    // the row and uploads the image in a second request, so a draft is a real row
    // with an empty URL and would reach the carousel as a blank slide.
    const { service, findMany } = setup();

    await service.listBanners({ gymId: 'gym-1' });

    expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      isActive: true,
      imageUrl: { not: '' },
    });
  });

  it('bounds the schedule window on both sides, treating null as unbounded', async () => {
    const { service, findMany } = setup();
    const now = new Date('2026-09-09T12:00:00.000Z');

    await service.listBanners({ gymId: 'gym-1' }, now);

    expect((findMany.mock.calls[0]?.[0]?.where as Args).AND).toEqual([
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    ]);
  });

  it('returns an empty reel rather than failing when nothing is running', async () => {
    const { service } = setup([]);

    await expect(service.listBanners({ gymId: 'gym-1' })).resolves.toEqual({ banners: [] });
  });
});
