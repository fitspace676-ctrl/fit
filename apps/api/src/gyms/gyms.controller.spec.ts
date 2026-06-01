import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListGymsResponse } from '@fit/types';
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
  const gyms = { list } as unknown as GymsService;
  return { controller: new GymsController(gyms), list };
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
});
