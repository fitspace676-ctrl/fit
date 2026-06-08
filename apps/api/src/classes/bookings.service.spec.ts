import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BookingStatus, InstanceStatus, Prisma } from '@fit/db';
import { BookingsService } from './bookings.service';
import type { CreditPacksService } from '../billing/credit-packs.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

const GYM_ID = 'gym-1';
const USER_ID = 'user-1';
const MEMBER_ID = 'gm-1';
const INSTANCE_ID = 'ci-1';

/** A class-instance row as INSTANCE_SELECT projects it. */
interface InstanceRecord {
  id: string;
  status: InstanceStatus;
  startsAt: Date;
  bookedCount: number;
  capacityOverride: number | null;
  template: { capacity: number };
}

/** Far enough out that the cancellation cutoff is never tripped by default. */
const FAR_FUTURE = new Date('2999-01-01T10:00:00.000Z');

const instance = (over?: Partial<InstanceRecord>): InstanceRecord => ({
  id: INSTANCE_ID,
  status: InstanceStatus.SCHEDULED,
  startsAt: FAR_FUTURE,
  bookedCount: 3,
  capacityOverride: null,
  template: { capacity: 10 },
  ...over,
});

/** A loose view of the query args the service passes — enough to assert on. */
interface QueryArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

function setup(opts?: {
  userId?: string | null;
  transaction?: (cb: (tx: unknown) => unknown) => unknown;
}) {
  const gymMember = { findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>() };
  const booking = {
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    aggregate: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    create: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    update: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    updateMany: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
  };
  const classInstance = {
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    updateMany: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
  };
  const gym = { findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>() };
  const subscription = { findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>() };
  const $transaction = vi.fn<(cb: (tx: unknown) => unknown) => unknown>();
  const client = { gymMember, booking, classInstance, gym, subscription, $transaction };
  // Assigned after `client` exists so the default thunk can hand the callback the
  // same mock object as its transaction client (`tx === client`).
  $transaction.mockImplementation(opts?.transaction ?? ((cb) => cb(client)));

  // The caller is a member of the gym unless the test says otherwise.
  gymMember.findFirst.mockResolvedValue({ id: MEMBER_ID });
  // No cancellation cutoff configured unless a test stores one.
  gym.findFirst.mockResolvedValue({ settings: null });
  // The member holds no frozen subscription unless a test says otherwise (T8.4).
  subscription.findFirst.mockResolvedValue(null);

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = {
    gymId: GYM_ID,
    userId: opts?.userId === undefined ? USER_ID : opts.userId,
  } as unknown as TenantContext;

  // The credit-pack draw/refund (T8.5) is exercised in `credit-packs.service.spec.ts`;
  // here it is a stub so the booking assertions stay focused on seats / the waitlist.
  // `chargeSeatCredit` defaults to `null` (no credit charged — e.g. a
  // subscription-covered seat), which leaves the existing booking expectations intact.
  const creditPacks = {
    chargeSeatCredit: vi
      .fn<(...args: unknown[]) => Promise<string | null>>()
      .mockResolvedValue(null),
    refundCredit: vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
  };

  return {
    service: new BookingsService(prisma, tenant, creditPacks as unknown as CreditPacksService),
    gymMember,
    booking,
    classInstance,
    gym,
    subscription,
    creditPacks,
    transaction: $transaction,
  };
}

const p2002 = (target: string | string[]) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });

describe('BookingsService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('books an open occurrence', () => {
    it('claims a seat (BOOKED) and bumps bookedCount in the transaction', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst
        .mockResolvedValueOnce(instance({ bookedCount: 3 })) // load
        .mockResolvedValueOnce({ bookedCount: 4 }); // post-increment re-read
      ctx.booking.findFirst.mockResolvedValueOnce(null); // no live booking
      ctx.classInstance.updateMany.mockResolvedValueOnce({ count: 1 });
      ctx.booking.create.mockResolvedValueOnce({ id: 'bk-1' });

      const result = await ctx.service.book(INSTANCE_ID);

      expect(result).toEqual({
        bookingId: 'bk-1',
        classInstanceId: INSTANCE_ID,
        status: BookingStatus.BOOKED,
        waitlistPosition: null,
        capacity: 10,
        bookedCount: 4,
        idempotentReplay: false,
      });
      // The capacity gate increments only while there is room.
      expect(ctx.classInstance.updateMany).toHaveBeenCalledWith({
        where: { id: INSTANCE_ID, status: InstanceStatus.SCHEDULED, bookedCount: { lt: 10 } },
        data: { bookedCount: { increment: 1 } },
      });
      // The seat + counter are written in one transaction.
      expect(ctx.transaction).toHaveBeenCalledTimes(1);
      expect(ctx.booking.create.mock.calls[0]?.[0]?.data).toMatchObject({
        gymId: GYM_ID,
        classInstanceId: INSTANCE_ID,
        memberId: MEMBER_ID,
        status: BookingStatus.BOOKED,
        waitlistPosition: null,
      });
    });

    it('honours a per-occurrence capacityOverride over the template capacity', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst
        .mockResolvedValueOnce(instance({ capacityOverride: 5, bookedCount: 4 }))
        .mockResolvedValueOnce({ bookedCount: 5 });
      ctx.booking.findFirst.mockResolvedValueOnce(null);
      ctx.classInstance.updateMany.mockResolvedValueOnce({ count: 1 });
      ctx.booking.create.mockResolvedValueOnce({ id: 'bk-2' });

      const result = await ctx.service.book(INSTANCE_ID);

      expect(result.capacity).toBe(5);
      expect(ctx.classInstance.updateMany.mock.calls[0]?.[0]?.where).toMatchObject({
        bookedCount: { lt: 5 },
      });
    });
  });

  describe('waitlists a full occurrence', () => {
    it('queues the member at the next position when no seat is free', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst
        .mockResolvedValueOnce(instance({ bookedCount: 10 }))
        .mockResolvedValueOnce({ bookedCount: 10 });
      ctx.booking.findFirst.mockResolvedValueOnce(null);
      ctx.classInstance.updateMany.mockResolvedValueOnce({ count: 0 }); // full
      ctx.booking.aggregate.mockResolvedValueOnce({ _max: { waitlistPosition: 2 } });
      ctx.booking.create.mockResolvedValueOnce({ id: 'bk-3' });

      const result = await ctx.service.book(INSTANCE_ID);

      expect(result).toMatchObject({
        status: BookingStatus.WAITLIST,
        waitlistPosition: 3,
        capacity: 10,
        bookedCount: 10,
      });
      expect(ctx.booking.create.mock.calls[0]?.[0]?.data).toMatchObject({
        status: BookingStatus.WAITLIST,
        waitlistPosition: 3,
      });
    });

    it('starts the waitlist at position 1 when the queue is empty', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst
        .mockResolvedValueOnce(instance({ bookedCount: 10 }))
        .mockResolvedValueOnce({ bookedCount: 10 });
      ctx.booking.findFirst.mockResolvedValueOnce(null);
      ctx.classInstance.updateMany.mockResolvedValueOnce({ count: 0 });
      ctx.booking.aggregate.mockResolvedValueOnce({ _max: { waitlistPosition: null } });
      ctx.booking.create.mockResolvedValueOnce({ id: 'bk-4' });

      const result = await ctx.service.book(INSTANCE_ID);

      expect(result.waitlistPosition).toBe(1);
    });
  });

  describe('credit packs (T8.5)', () => {
    it('charges a class credit for a confirmed seat and records the pack on the booking', async () => {
      const ctx = setup();
      ctx.creditPacks.chargeSeatCredit.mockResolvedValueOnce('pack-1');
      ctx.classInstance.findFirst
        .mockResolvedValueOnce(instance({ bookedCount: 3 }))
        .mockResolvedValueOnce({ bookedCount: 4 });
      ctx.booking.findFirst.mockResolvedValueOnce(null);
      ctx.classInstance.updateMany.mockResolvedValueOnce({ count: 1 });
      ctx.booking.create.mockResolvedValueOnce({ id: 'bk-1' });

      await ctx.service.book(INSTANCE_ID);

      // A confirmed seat draws a credit for the caller's own membership...
      expect(ctx.creditPacks.chargeSeatCredit).toHaveBeenCalledTimes(1);
      expect(ctx.creditPacks.chargeSeatCredit.mock.calls[0]?.[1]).toBe(MEMBER_ID);
      // ...and the pack it was drawn from is recorded on the booking for a later refund.
      expect(ctx.booking.create.mock.calls[0]?.[0]?.data).toMatchObject({
        status: BookingStatus.BOOKED,
        creditPackId: 'pack-1',
      });
    });

    it('does not charge a credit for a waitlist entry (no seat held)', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst
        .mockResolvedValueOnce(instance({ bookedCount: 10 }))
        .mockResolvedValueOnce({ bookedCount: 10 });
      ctx.booking.findFirst.mockResolvedValueOnce(null);
      ctx.classInstance.updateMany.mockResolvedValueOnce({ count: 0 }); // full
      ctx.booking.aggregate.mockResolvedValueOnce({ _max: { waitlistPosition: null } });
      ctx.booking.create.mockResolvedValueOnce({ id: 'bk-wl' });

      await ctx.service.book(INSTANCE_ID);

      expect(ctx.creditPacks.chargeSeatCredit).not.toHaveBeenCalled();
      expect(ctx.booking.create.mock.calls[0]?.[0]?.data).toMatchObject({
        status: BookingStatus.WAITLIST,
        creditPackId: null,
      });
    });

    it('rolls back the seat when the booking can not be paid for (INSUFFICIENT_CREDITS)', async () => {
      const ctx = setup();
      ctx.creditPacks.chargeSeatCredit.mockRejectedValueOnce(
        new UnprocessableEntityException({
          message: 'You have no class credits left',
          code: 'INSUFFICIENT_CREDITS',
        }),
      );
      ctx.classInstance.findFirst.mockResolvedValueOnce(instance({ bookedCount: 3 }));
      ctx.booking.findFirst.mockResolvedValueOnce(null);
      ctx.classInstance.updateMany.mockResolvedValueOnce({ count: 1 });

      const error = await ctx.service.book(INSTANCE_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'INSUFFICIENT_CREDITS',
      });
      // The refusal threw before the booking row was written — the seat increment
      // it follows is rolled back with the (failed) transaction.
      expect(ctx.booking.create).not.toHaveBeenCalled();
    });

    it('refunds the credit when a confirmed, credit-charged seat is released', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst
        .mockResolvedValueOnce(instance({ bookedCount: 10 }))
        .mockResolvedValueOnce({ bookedCount: 9 });
      ctx.booking.findFirst
        .mockResolvedValueOnce({
          id: 'bk-booked',
          status: BookingStatus.BOOKED,
          waitlistPosition: null,
          creditPackId: 'pack-1',
        })
        .mockResolvedValueOnce(null); // empty queue
      ctx.booking.update.mockResolvedValueOnce({});
      ctx.classInstance.updateMany.mockResolvedValueOnce({ count: 1 }); // seat back to pool

      await ctx.service.cancel(INSTANCE_ID);

      expect(ctx.creditPacks.refundCredit).toHaveBeenCalledTimes(1);
      expect(ctx.creditPacks.refundCredit.mock.calls[0]?.[1]).toBe('pack-1');
    });
  });

  describe('rejects an unbookable request', () => {
    it('404s an unknown / cross-tenant occurrence', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst.mockResolvedValueOnce(null);

      const error = await ctx.service.book(INSTANCE_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toMatchObject({
        code: 'CLASS_INSTANCE_NOT_FOUND',
      });
      expect(ctx.booking.create).not.toHaveBeenCalled();
    });

    it('409s a canceled / completed occurrence (CLASS_NOT_BOOKABLE)', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst.mockResolvedValueOnce(
        instance({ status: InstanceStatus.CANCELED }),
      );

      const error = await ctx.service.book(INSTANCE_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'CLASS_NOT_BOOKABLE',
      });
      expect(ctx.classInstance.updateMany).not.toHaveBeenCalled();
    });

    it('409s a member who already holds a live booking (ALREADY_BOOKED)', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst.mockResolvedValueOnce(instance());
      ctx.booking.findFirst.mockResolvedValueOnce({ id: 'bk-existing' }); // live booking

      const error = await ctx.service.book(INSTANCE_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'ALREADY_BOOKED' });
      expect(ctx.classInstance.updateMany).not.toHaveBeenCalled();
    });

    it('403s a caller who is not a member of the gym (NOT_A_MEMBER)', async () => {
      const ctx = setup();
      ctx.gymMember.findFirst.mockResolvedValueOnce(null);

      const error = await ctx.service.book(INSTANCE_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'NOT_A_MEMBER' });
      expect(ctx.transaction).not.toHaveBeenCalled();
    });

    it('403s a session with no authenticated user (MEMBER_SESSION_REQUIRED)', async () => {
      const ctx = setup({ userId: null });

      const error = await ctx.service.book(INSTANCE_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'MEMBER_SESSION_REQUIRED',
      });
    });

    it('403s a member whose membership is frozen (SUBSCRIPTION_FROZEN, T8.4)', async () => {
      const ctx = setup();
      const frozenUntil = new Date('2026-07-01T00:00:00.000Z');
      ctx.subscription.findFirst.mockResolvedValueOnce({ frozenUntil });

      const error = await ctx.service.book(INSTANCE_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'SUBSCRIPTION_FROZEN',
        frozenUntil: frozenUntil.toISOString(),
      });
      // The freeze gate runs before any booking work — no transaction is opened.
      expect(ctx.transaction).not.toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('replays an existing booking for the same key without taking a new seat', async () => {
      const ctx = setup();
      ctx.booking.findFirst.mockResolvedValueOnce({
        id: 'bk-1',
        classInstanceId: INSTANCE_ID,
        memberId: MEMBER_ID,
        status: BookingStatus.BOOKED,
        waitlistPosition: null,
      });
      ctx.classInstance.findFirst.mockResolvedValueOnce(instance({ bookedCount: 4 }));

      const result = await ctx.service.book(INSTANCE_ID, 'key-123');

      expect(result).toEqual({
        bookingId: 'bk-1',
        classInstanceId: INSTANCE_ID,
        status: BookingStatus.BOOKED,
        waitlistPosition: null,
        capacity: 10,
        bookedCount: 4,
        idempotentReplay: true,
      });
      // No write path was entered on a replay.
      expect(ctx.transaction).not.toHaveBeenCalled();
      expect(ctx.classInstance.updateMany).not.toHaveBeenCalled();
    });

    it('409s a key reused for a different occurrence (IDEMPOTENCY_KEY_REUSED)', async () => {
      const ctx = setup();
      ctx.booking.findFirst.mockResolvedValueOnce({
        id: 'bk-1',
        classInstanceId: 'ci-other',
        memberId: MEMBER_ID,
        status: BookingStatus.BOOKED,
        waitlistPosition: null,
      });

      const error = await ctx.service.book(INSTANCE_ID, 'key-123').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'IDEMPOTENCY_KEY_REUSED',
      });
      expect(ctx.transaction).not.toHaveBeenCalled();
    });

    it('replays on a concurrent same-key unique-violation (P2002 on idempotencyKey)', async () => {
      const ctx = setup({
        transaction: () => {
          throw p2002(['idempotencyKey']);
        },
      });
      ctx.booking.findFirst
        .mockResolvedValueOnce(null) // pre-check: not yet present
        .mockResolvedValueOnce({
          // re-lookup after the race resolved
          id: 'bk-winner',
          classInstanceId: INSTANCE_ID,
          memberId: MEMBER_ID,
          status: BookingStatus.WAITLIST,
          waitlistPosition: 1,
        });
      ctx.classInstance.findFirst.mockResolvedValueOnce(instance({ bookedCount: 10 }));

      const result = await ctx.service.book(INSTANCE_ID, 'key-123');

      expect(result).toMatchObject({
        bookingId: 'bk-winner',
        status: BookingStatus.WAITLIST,
        waitlistPosition: 1,
        idempotentReplay: true,
      });
    });

    it('409s a concurrent duplicate from the same member (P2002 on the active partial unique)', async () => {
      const ctx = setup({
        transaction: () => {
          throw p2002('bookings_classInstanceId_memberId_active_key');
        },
      });

      const error = await ctx.service.book(INSTANCE_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'ALREADY_BOOKED' });
    });
  });

  describe('cancel', () => {
    it('releases a confirmed seat and auto-promotes the head of the waitlist (seat transferred)', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst
        .mockResolvedValueOnce(instance({ bookedCount: 10 })) // load
        .mockResolvedValueOnce({ bookedCount: 10 }); // post-cancel re-read
      ctx.booking.findFirst
        .mockResolvedValueOnce({
          id: 'bk-booked',
          status: BookingStatus.BOOKED,
          waitlistPosition: null,
        }) // caller's booking
        .mockResolvedValueOnce({ id: 'bk-wl1', waitlistPosition: 1 }); // head of queue
      ctx.booking.update.mockResolvedValueOnce({});
      ctx.booking.updateMany
        .mockResolvedValueOnce({ count: 1 }) // claim the queue head
        .mockResolvedValueOnce({ count: 0 }); // close-the-gap decrement

      const result = await ctx.service.cancel(INSTANCE_ID);

      expect(result).toEqual({
        bookingId: 'bk-booked',
        classInstanceId: INSTANCE_ID,
        status: BookingStatus.CANCELED,
        promotedBookingId: 'bk-wl1',
        capacity: 10,
        bookedCount: 10, // unchanged — the seat was handed straight to the promotee
      });
      // The seat was transferred, never returned to the pool.
      expect(ctx.classInstance.updateMany).not.toHaveBeenCalled();
      // The promotion is a conditional claim guarded on WAITLIST status.
      expect(ctx.booking.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'bk-wl1', status: BookingStatus.WAITLIST },
        data: { status: BookingStatus.BOOKED, waitlistPosition: null },
      });
      // Then the gap the promotee left is closed (positions > 1 shift down).
      expect(ctx.booking.updateMany).toHaveBeenNthCalledWith(2, {
        where: {
          classInstanceId: INSTANCE_ID,
          status: BookingStatus.WAITLIST,
          waitlistPosition: { gt: 1 },
        },
        data: { waitlistPosition: { decrement: 1 } },
      });
    });

    it('releases the seat back to the pool when the queue is empty (bookedCount decremented)', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst
        .mockResolvedValueOnce(instance({ bookedCount: 5 }))
        .mockResolvedValueOnce({ bookedCount: 4 });
      ctx.booking.findFirst
        .mockResolvedValueOnce({
          id: 'bk-booked',
          status: BookingStatus.BOOKED,
          waitlistPosition: null,
        })
        .mockResolvedValueOnce(null); // empty queue
      ctx.booking.update.mockResolvedValueOnce({});
      ctx.classInstance.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await ctx.service.cancel(INSTANCE_ID);

      expect(result).toMatchObject({ promotedBookingId: null, bookedCount: 4 });
      // The decrement is floored at zero (never goes negative).
      expect(ctx.classInstance.updateMany).toHaveBeenCalledWith({
        where: { id: INSTANCE_ID, bookedCount: { gt: 0 } },
        data: { bookedCount: { decrement: 1 } },
      });
      expect(ctx.booking.updateMany).not.toHaveBeenCalled();
    });

    it('skips a queue entry already claimed by a concurrent cancellation and promotes the next', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst
        .mockResolvedValueOnce(instance({ bookedCount: 10 }))
        .mockResolvedValueOnce({ bookedCount: 10 });
      ctx.booking.findFirst
        .mockResolvedValueOnce({
          id: 'bk-booked',
          status: BookingStatus.BOOKED,
          waitlistPosition: null,
        })
        .mockResolvedValueOnce({ id: 'bk-wl1', waitlistPosition: 1 }) // head, but lost the race
        .mockResolvedValueOnce({ id: 'bk-wl2', waitlistPosition: 2 }); // new head after retry
      ctx.booking.update.mockResolvedValueOnce({});
      ctx.booking.updateMany
        .mockResolvedValueOnce({ count: 0 }) // bk-wl1 already promoted elsewhere
        .mockResolvedValueOnce({ count: 1 }) // bk-wl2 claimed
        .mockResolvedValueOnce({ count: 0 }); // close-the-gap decrement

      const result = await ctx.service.cancel(INSTANCE_ID);

      expect(result.promotedBookingId).toBe('bk-wl2');
      expect(ctx.booking.findFirst).toHaveBeenCalledTimes(3);
    });

    it('removes a waitlisted member without touching the seat count and closes the gap', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst
        .mockResolvedValueOnce(instance({ bookedCount: 10 }))
        .mockResolvedValueOnce({ bookedCount: 10 });
      ctx.booking.findFirst.mockResolvedValueOnce({
        id: 'bk-wl',
        status: BookingStatus.WAITLIST,
        waitlistPosition: 2,
      });
      ctx.booking.update.mockResolvedValueOnce({});
      ctx.booking.updateMany.mockResolvedValueOnce({ count: 1 }); // close-the-gap decrement

      const result = await ctx.service.cancel(INSTANCE_ID);

      expect(result).toMatchObject({ promotedBookingId: null, bookedCount: 10 });
      // No seat was held, so the live counter is untouched...
      expect(ctx.classInstance.updateMany).not.toHaveBeenCalled();
      // ...and the entries behind the departing member shift down one.
      expect(ctx.booking.updateMany).toHaveBeenCalledWith({
        where: {
          classInstanceId: INSTANCE_ID,
          status: BookingStatus.WAITLIST,
          waitlistPosition: { gt: 2 },
        },
        data: { waitlistPosition: { decrement: 1 } },
      });
    });

    it('404s an unknown / cross-tenant occurrence', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst.mockResolvedValueOnce(null);

      const error = await ctx.service.cancel(INSTANCE_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toMatchObject({
        code: 'CLASS_INSTANCE_NOT_FOUND',
      });
      expect(ctx.booking.update).not.toHaveBeenCalled();
    });

    it('409s once the occurrence is no longer SCHEDULED (BOOKING_NOT_CANCELABLE)', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst.mockResolvedValueOnce(
        instance({ status: InstanceStatus.COMPLETED }),
      );

      const error = await ctx.service.cancel(INSTANCE_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'BOOKING_NOT_CANCELABLE',
      });
      expect(ctx.booking.findFirst).not.toHaveBeenCalled();
      expect(ctx.booking.update).not.toHaveBeenCalled();
    });

    it('404s when the caller holds no live booking (BOOKING_NOT_FOUND)', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst.mockResolvedValueOnce(instance());
      ctx.booking.findFirst.mockResolvedValueOnce(null);

      const error = await ctx.service.cancel(INSTANCE_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toMatchObject({
        code: 'BOOKING_NOT_FOUND',
      });
      expect(ctx.booking.update).not.toHaveBeenCalled();
    });

    it('403s a caller who is not a member of the gym (NOT_A_MEMBER)', async () => {
      const ctx = setup();
      ctx.gymMember.findFirst.mockResolvedValueOnce(null);

      const error = await ctx.service.cancel(INSTANCE_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'NOT_A_MEMBER' });
      expect(ctx.transaction).not.toHaveBeenCalled();
    });

    describe('cancellation cutoff policy (T5.6)', () => {
      it('409s a confirmed seat released inside the cutoff window (CANCELLATION_WINDOW_PASSED)', async () => {
        const ctx = setup();
        const soon = new Date(Date.now() + 60 * 60 * 1000); // 1h out — inside a 2h cutoff
        ctx.classInstance.findFirst.mockResolvedValueOnce(instance({ startsAt: soon }));
        ctx.booking.findFirst.mockResolvedValueOnce({
          id: 'bk-booked',
          status: BookingStatus.BOOKED,
          waitlistPosition: null,
        });
        ctx.gym.findFirst.mockResolvedValueOnce({
          settings: { booking: { cancellationCutoffHours: 2 } },
        });

        const error = await ctx.service.cancel(INSTANCE_ID).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toMatchObject({
          code: 'CANCELLATION_WINDOW_PASSED',
        });
        // The seat is never released and no one is promoted.
        expect(ctx.booking.update).not.toHaveBeenCalled();
        expect(ctx.booking.updateMany).not.toHaveBeenCalled();
        expect(ctx.classInstance.updateMany).not.toHaveBeenCalled();
      });

      it('allows a confirmed cancellation comfortably before the cutoff window', async () => {
        const ctx = setup();
        const later = new Date(Date.now() + 5 * 60 * 60 * 1000); // 5h out — outside a 2h cutoff
        ctx.classInstance.findFirst
          .mockResolvedValueOnce(instance({ startsAt: later, bookedCount: 5 }))
          .mockResolvedValueOnce({ bookedCount: 4 });
        ctx.booking.findFirst
          .mockResolvedValueOnce({
            id: 'bk-booked',
            status: BookingStatus.BOOKED,
            waitlistPosition: null,
          })
          .mockResolvedValueOnce(null); // empty queue
        ctx.gym.findFirst.mockResolvedValueOnce({
          settings: { booking: { cancellationCutoffHours: 2 } },
        });
        ctx.booking.update.mockResolvedValueOnce({});
        ctx.classInstance.updateMany.mockResolvedValueOnce({ count: 1 });

        const result = await ctx.service.cancel(INSTANCE_ID);

        expect(result).toMatchObject({ status: BookingStatus.CANCELED, bookedCount: 4 });
        expect(ctx.booking.update).toHaveBeenCalledOnce();
      });

      it('lets a waitlisted member leave inside the cutoff window (no seat held)', async () => {
        const ctx = setup();
        const soon = new Date(Date.now() + 60 * 60 * 1000); // inside a 2h cutoff
        ctx.classInstance.findFirst
          .mockResolvedValueOnce(instance({ startsAt: soon, bookedCount: 10 }))
          .mockResolvedValueOnce({ bookedCount: 10 });
        ctx.booking.findFirst.mockResolvedValueOnce({
          id: 'bk-wl',
          status: BookingStatus.WAITLIST,
          waitlistPosition: 2,
        });
        ctx.gym.findFirst.mockResolvedValue({
          settings: { booking: { cancellationCutoffHours: 2 } },
        });
        ctx.booking.update.mockResolvedValueOnce({});
        ctx.booking.updateMany.mockResolvedValueOnce({ count: 1 }); // close-the-gap

        const result = await ctx.service.cancel(INSTANCE_ID);

        expect(result).toMatchObject({ status: BookingStatus.CANCELED, promotedBookingId: null });
        // The policy is never consulted for a waitlist exit — it holds no seat.
        expect(ctx.gym.findFirst).not.toHaveBeenCalled();
      });
    });
  });
});
