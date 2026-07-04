import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type {
  ListCreditPackCatalogueResponse,
  ListCreditPacksResponse,
  PurchaseCreditPackResponse,
} from '@fit/types';
import { AdminCreditPacksController } from './admin-credit-packs.controller';
import type { CreditPacksService } from './credit-packs.service';

function setup() {
  const listMemberCreditPacks = vi.fn<() => Promise<ListCreditPacksResponse>>(() =>
    Promise.resolve({ packs: [] }),
  );
  const grantPackForMember = vi.fn<() => Promise<PurchaseCreditPackResponse>>(() =>
    Promise.resolve({ creditPackId: 'pack-9' }),
  );
  const listCatalogue = vi.fn<() => Promise<ListCreditPackCatalogueResponse>>(() =>
    Promise.resolve({ packs: [] }),
  );
  const service = {
    listMemberCreditPacks,
    grantPackForMember,
    listCatalogue,
  } as unknown as CreditPacksService;
  return {
    controller: new AdminCreditPacksController(service),
    listMemberCreditPacks,
    grantPackForMember,
    listCatalogue,
  };
}

describe('AdminCreditPacksController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('GET /admin/members/:id/credit-packs', () => {
    it('delegates the member id to the service', async () => {
      const result = await ctx.controller.listForMember('gm-1');

      expect(ctx.listMemberCreditPacks).toHaveBeenCalledWith('gm-1');
      expect(result).toEqual({ packs: [] });
    });
  });

  describe('POST /admin/members/:id/credit-packs', () => {
    it('parses the body and grants the validated pack to the member', async () => {
      const result = await ctx.controller.grantForMember('gm-1', { packId: 'plan-1' });

      expect(ctx.grantPackForMember).toHaveBeenCalledWith('gm-1', { packId: 'plan-1' });
      expect(result).toEqual({ creditPackId: 'pack-9' });
    });

    it('rejects a missing packId with 400 without hitting the service', async () => {
      const error = await ctx.controller.grantForMember('gm-1', {}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.grantPackForMember).not.toHaveBeenCalled();
    });
  });

  describe('GET /admin/credit-packs/catalogue', () => {
    it('delegates to the service and returns the catalogue', async () => {
      const result = await ctx.controller.catalogue();

      expect(ctx.listCatalogue).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ packs: [] });
    });
  });
});
