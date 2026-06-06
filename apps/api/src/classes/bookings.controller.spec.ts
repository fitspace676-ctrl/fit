import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import type { BookingsService } from './bookings.service';
import type { BookClassInstanceResult } from '@fit/types';

const RESULT: BookClassInstanceResult = {
  bookingId: 'bk-1',
  classInstanceId: 'ci-1',
  status: 'BOOKED',
  waitlistPosition: null,
  capacity: 10,
  bookedCount: 4,
  idempotentReplay: false,
};

function setup() {
  const book = vi.fn<() => Promise<BookClassInstanceResult>>(() => Promise.resolve(RESULT));
  const bookings = { book } as unknown as BookingsService;
  return { controller: new BookingsController(bookings), book };
}

describe('BookingsController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('POST /class-instances/:id/bookings', () => {
    it('delegates the occurrence id and trimmed idempotency key to the service', async () => {
      const result = await ctx.controller.book('ci-1', '  key-123  ');

      expect(ctx.book).toHaveBeenCalledWith('ci-1', 'key-123');
      expect(result).toEqual(RESULT);
    });

    it('treats an absent header as no idempotency key', async () => {
      await ctx.controller.book('ci-1', undefined);

      expect(ctx.book).toHaveBeenCalledWith('ci-1', undefined);
    });

    it('treats a whitespace-only header as no idempotency key', async () => {
      await ctx.controller.book('ci-1', '   ');

      expect(ctx.book).toHaveBeenCalledWith('ci-1', undefined);
    });

    it('rejects a malformed (over-length) idempotency key with 400 without hitting the service', async () => {
      const error = await ctx.controller.book('ci-1', 'x'.repeat(201)).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.book).not.toHaveBeenCalled();
    });
  });
});
