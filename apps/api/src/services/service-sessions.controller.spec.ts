import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ListServiceSlotsResponse } from '@fit/types';
import type { PortalBranchService } from '../common/portal-branch.service';
import { ServiceSlotsController } from './service-sessions.controller';
import type { ServiceSessionsService } from './service-sessions.service';

const WINDOW = { from: '2026-09-01T00:00:00.000Z', to: '2026-09-08T00:00:00.000Z' };

function setup() {
  const listOpenSlots = vi.fn<() => Promise<ListServiceSlotsResponse>>(() =>
    Promise.resolve({ slots: [] }),
  );
  const sessions = { listOpenSlots } as unknown as ServiceSessionsService;
  const resolve = vi.fn<PortalBranchService['resolve']>(() => Promise.resolve(undefined));
  const portalBranch = { resolve } as unknown as PortalBranchService;
  return {
    controller: new ServiceSlotsController(sessions, portalBranch),
    listOpenSlots,
    resolve,
  };
}

describe('ServiceSlotsController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('GET /service-sessions', () => {
    it('rejects a missing gymId with 400 without resolving a branch', async () => {
      const error = await ctx.controller.list(WINDOW).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.resolve).not.toHaveBeenCalled();
      expect(ctx.listOpenSlots).not.toHaveBeenCalled();
    });

    it('narrows a signed-in member to the branch resolved from their session', async () => {
      ctx.resolve.mockResolvedValueOnce('loc-home');

      await ctx.controller.list({ gymId: 'gym-1', ...WINDOW }, 'Bearer tok');

      expect(ctx.resolve).toHaveBeenCalledWith({
        gymId: 'gym-1',
        ...WINDOW,
        authorization: 'Bearer tok',
      });
      expect(ctx.listOpenSlots).toHaveBeenCalledWith({
        gymId: 'gym-1',
        ...WINDOW,
        locationId: 'loc-home',
      });
    });

    it('lists every branch for an anonymous visitor', async () => {
      const result = await ctx.controller.list({ gymId: 'gym-1', ...WINDOW });

      expect(ctx.listOpenSlots.mock.calls[0]).toEqual([
        { gymId: 'gym-1', ...WINDOW, locationId: undefined },
      ]);
      expect(result).toEqual({ slots: [] });
    });

    it('hands a same-gym override to the resolver and lists that branch', async () => {
      ctx.resolve.mockResolvedValueOnce('loc-2');

      await ctx.controller.list({ gymId: 'gym-1', locationId: 'loc-2', ...WINDOW }, 'Bearer tok');

      expect(ctx.resolve).toHaveBeenCalledWith(
        expect.objectContaining({ gymId: 'gym-1', locationId: 'loc-2' }),
      );
      expect(ctx.listOpenSlots).toHaveBeenCalledWith(
        expect.objectContaining({ gymId: 'gym-1', locationId: 'loc-2' }),
      );
    });

    it("404s another gym's branch without listing anything", async () => {
      ctx.resolve.mockRejectedValueOnce(new NotFoundException());

      const error = await ctx.controller
        .list({ gymId: 'gym-1', locationId: 'loc-other-gym', ...WINDOW })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(ctx.listOpenSlots).not.toHaveBeenCalled();
    });
  });
});
