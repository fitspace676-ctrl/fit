import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { ListCreditPacksResponse, PurchaseCreditPackResponse } from '@fit/types';
import { CreditPacksController } from './credit-packs.controller';
import { MemberCreditPacksController } from './member-credit-packs.controller';
import type { CreditPacksService } from './credit-packs.service';

function setup() {
  const purchasePack = vi.fn<() => Promise<PurchaseCreditPackResponse>>(() =>
    Promise.resolve({ creditPackId: 'pack-1' }),
  );
  const listMyCreditPacks = vi.fn<() => Promise<ListCreditPacksResponse>>(() =>
    Promise.resolve({ packs: [] }),
  );
  const service = { purchasePack, listMyCreditPacks } as unknown as CreditPacksService;
  return {
    purchase: new CreditPacksController(service),
    listing: new MemberCreditPacksController(service),
    purchasePack,
    listMyCreditPacks,
  };
}

describe('CreditPacksController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('POST /credit-packs/purchase', () => {
    it('parses the body and delegates the validated packId to the service', async () => {
      const result = await ctx.purchase.purchase({ packId: 'plan-1' });

      expect(ctx.purchasePack).toHaveBeenCalledWith({ packId: 'plan-1' });
      expect(result).toEqual({ creditPackId: 'pack-1' });
    });

    it('rejects a missing packId with 400 without hitting the service', async () => {
      const error = await ctx.purchase.purchase({}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.purchasePack).not.toHaveBeenCalled();
    });

    it('rejects an empty packId with 400', async () => {
      const error = await ctx.purchase.purchase({ packId: '' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.purchasePack).not.toHaveBeenCalled();
    });
  });

  describe('GET /members/me/credit-packs', () => {
    it('delegates to the service and returns the packs', async () => {
      const result = await ctx.listing.list();

      expect(ctx.listMyCreditPacks).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ packs: [] });
    });
  });
});
