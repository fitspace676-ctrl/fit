import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BookingStatus, InstanceStatus, Prisma } from '@fit/db';
import { BookingsService } from './bookings.service';
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
  bookedCount: number;
  capacityOverride: number | null;
  template: { capacity: number };
}

const instance = (over?: Partial<InstanceRecord>): InstanceRecord => ({
  id: INSTANCE_ID,
  status: InstanceStatus.SCHEDULED,
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
  };
  const classInstance = {
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    updateMany: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
  };
  const $transaction = vi.fn<(cb: (tx: unknown) => unknown) => unknown>();
  const client = { gymMember, booking, classInstance, $transaction };
  // Assigned after `client` exists so the default thunk can hand the callback the
  // same mock object as its transaction client (`tx === client`).
  $transaction.mockImplementation(opts?.transaction ?? ((cb) => cb(client)));

  // The caller is a member of the gym unless the test says otherwise.
  gymMember.findFirst.mockResolvedValue({ id: MEMBER_ID });

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = {
    gymId: GYM_ID,
    userId: opts?.userId === undefined ? USER_ID : opts.userId,
  } as unknown as TenantContext;

  return {
    service: new BookingsService(prisma, tenant),
    gymMember,
    booking,
    classInstance,
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
});
