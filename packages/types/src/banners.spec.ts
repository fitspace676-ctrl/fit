import { describe, expect, it } from 'vitest';
import {
  createBannerSchema,
  listPublicBannersQuerySchema,
  publicBannerSchema,
  reorderBannersSchema,
  updateBannerSchema,
} from './banners';

describe('createBannerSchema', () => {
  it('accepts a bare draft — a banner is created before its artwork is uploaded', () => {
    const result = createBannerSchema.parse({});
    expect(result).toEqual({ isActive: true });
  });

  it('defaults isActive to true so a newly authored banner is live once dated', () => {
    expect(createBannerSchema.parse({ title: 'Summer' }).isActive).toBe(true);
  });

  it('keeps isActive false when the author explicitly parks the banner', () => {
    expect(createBannerSchema.parse({ isActive: false }).isActive).toBe(false);
  });

  it('accepts an in-app deep link as the destination, not just an http URL', () => {
    // The reason this is not `z.string().url()`: `/shop/product/abc` is the most
    // common destination a gym picks, and a URL validator rejects it.
    expect(createBannerSchema.parse({ linkUrl: '/shop/product/abc' }).linkUrl).toBe(
      '/shop/product/abc',
    );
  });

  it('rejects a window that ends before it starts', () => {
    const result = createBannerSchema.safeParse({
      startsAt: '2026-09-10T00:00:00.000Z',
      endsAt: '2026-09-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['endsAt']);
  });

  it('rejects a zero-length window', () => {
    const at = '2026-09-10T00:00:00.000Z';
    expect(createBannerSchema.safeParse({ startsAt: at, endsAt: at }).success).toBe(false);
  });

  it('accepts one open end of the window', () => {
    expect(createBannerSchema.safeParse({ startsAt: '2026-09-10T00:00:00.000Z' }).success).toBe(
      true,
    );
    expect(createBannerSchema.safeParse({ endsAt: '2026-09-10T00:00:00.000Z' }).success).toBe(true);
  });

  it('rejects a non-ISO date', () => {
    expect(createBannerSchema.safeParse({ startsAt: '2026-09-10' }).success).toBe(false);
  });
});

describe('updateBannerSchema', () => {
  it('accepts an empty patch', () => {
    expect(updateBannerSchema.parse({})).toEqual({});
  });

  it('distinguishes clearing a field from leaving it alone', () => {
    expect(updateBannerSchema.parse({ endsAt: null })).toEqual({ endsAt: null });
    expect('endsAt' in updateBannerSchema.parse({ title: 'x' })).toBe(false);
  });

  it('does not default isActive — an omitted switch must not silently flip', () => {
    expect(updateBannerSchema.parse({ title: 'x' }).isActive).toBeUndefined();
  });

  it('still rejects an inverted window when the patch carries both ends', () => {
    const result = updateBannerSchema.safeParse({
      startsAt: '2026-09-10T00:00:00.000Z',
      endsAt: '2026-09-09T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('leaves a one-sided window to the service, which knows the stored other end', () => {
    expect(updateBannerSchema.safeParse({ endsAt: '2020-01-01T00:00:00.000Z' }).success).toBe(true);
  });
});

describe('reorderBannersSchema', () => {
  it('takes the ids in their new order', () => {
    expect(reorderBannersSchema.parse({ ids: ['a', 'b'] })).toEqual({ ids: ['a', 'b'] });
  });

  it('rejects an empty reorder', () => {
    expect(reorderBannersSchema.safeParse({ ids: [] }).success).toBe(false);
  });
});

describe('publicBannerSchema', () => {
  it('carries only what a slide draws — no scheduling metadata reaches the app', () => {
    expect(Object.keys(publicBannerSchema.shape).sort()).toEqual([
      'id',
      'imageUrl',
      'linkUrl',
      'title',
    ]);
  });

  it('accepts a slide with no headline and no destination', () => {
    const parsed = publicBannerSchema.parse({
      id: 'b1',
      title: null,
      imageUrl: 'https://cdn.example.com/a.jpg',
      linkUrl: null,
    });
    expect(parsed.title).toBeNull();
  });
});

describe('listPublicBannersQuerySchema', () => {
  it('requires a gymId — the route has no session to derive one from', () => {
    expect(listPublicBannersQuerySchema.safeParse({}).success).toBe(false);
    expect(listPublicBannersQuerySchema.parse({ gymId: 'g1' })).toEqual({ gymId: 'g1' });
  });
});
