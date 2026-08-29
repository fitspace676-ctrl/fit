import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { GymBySubdomainResponse, ListGymsResponse } from '@fit/types';
import { GymsController } from './gyms.controller';
import type { GymsService } from './gyms.service';

function setup() {
  const list = vi.fn<() => Promise<ListGymsResponse>>(() =>
    Promise.resolve({
      gyms: [
        {
          id: 'gym-1',
          name: 'Downtown Strength',
          slug: 'downtown',
          ownerId: 'owner-1',
          memberCount: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }),
  );
  const resolveBySubdomain = vi.fn<(slug: string) => Promise<GymBySubdomainResponse>>(() =>
    Promise.resolve({
      gymId: 'gym-1',
      name: 'Downtown Strength',
      brand: null,
      contact: null,
      timezone: 'Asia/Tbilisi',
      portal: { loginImageUrl: null, primaryColor: '#84cc16', accentColor: '#1c1917' },
    }),
  );
  const gyms = { list, resolveBySubdomain } as unknown as GymsService;
  return { controller: new GymsController(gyms), list, resolveBySubdomain };
}

describe('GymsController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('GET /gyms', () => {
    it('delegates to the service and returns the roster', async () => {
      const result = await ctx.controller.list();

      expect(ctx.list).toHaveBeenCalledOnce();
      expect(result.gyms).toHaveLength(1);
      expect(result.gyms[0]).toMatchObject({ slug: 'downtown', memberCount: 3 });
    });
  });

  describe('GET /gyms/by-subdomain/:slug', () => {
    it('normalises the slug and delegates to the service', async () => {
      const result = await ctx.controller.bySubdomain('DownTown');

      // Slug schema lower-cases before the lookup.
      expect(ctx.resolveBySubdomain).toHaveBeenCalledWith('downtown');
      expect(result).toEqual({
        gymId: 'gym-1',
        name: 'Downtown Strength',
        brand: null,
        contact: null,
        timezone: 'Asia/Tbilisi',
        portal: { loginImageUrl: null, primaryColor: '#84cc16', accentColor: '#1c1917' },
      });
    });

    it('returns 404 GYM_NOT_FOUND for a reserved label without hitting the service', async () => {
      const error = await ctx.controller.bySubdomain('admin').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'GYM_NOT_FOUND' });
      expect(ctx.resolveBySubdomain).not.toHaveBeenCalled();
    });

    it('returns 404 GYM_NOT_FOUND for a malformed slug without hitting the service', async () => {
      const error = await ctx.controller.bySubdomain('Not A Slug!').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(ctx.resolveBySubdomain).not.toHaveBeenCalled();
    });
  });
});
