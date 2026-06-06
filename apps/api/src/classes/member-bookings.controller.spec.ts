import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { ListMemberBookingsResponse } from '@fit/types';
import { MemberBookingsController } from './member-bookings.controller';
import type { MemberBookingsService } from './member-bookings.service';

const RESULT: ListMemberBookingsResponse = { bookings: [] };

function setup() {
  const list = vi.fn<() => Promise<ListMemberBookingsResponse>>(() => Promise.resolve(RESULT));
  const service = { list } as unknown as MemberBookingsService;
  return { controller: new MemberBookingsController(service), list };
}

describe('MemberBookingsController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('GET /me/bookings', () => {
    it('parses an explicit scope and delegates it to the service', async () => {
      const result = await ctx.controller.list({ scope: 'upcoming' });

      expect(ctx.list).toHaveBeenCalledWith({ scope: 'upcoming' });
      expect(result).toEqual(RESULT);
    });

    it('defaults an omitted scope to "all"', async () => {
      await ctx.controller.list({});

      expect(ctx.list).toHaveBeenCalledWith({ scope: 'all' });
    });

    it('rejects an unknown scope with 400 without hitting the service', async () => {
      const error = await ctx.controller.list({ scope: 'tomorrow' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.list).not.toHaveBeenCalled();
    });
  });
});
