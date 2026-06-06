import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus, InstanceStatus } from '@fit/db';
import { AttendanceService } from './attendance.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

const INSTANCE_ID = 'ci-1';

/** A class-instance row as INSTANCE_SELECT projects it. */
interface InstanceRecord {
  id: string;
  status: InstanceStatus;
  startsAt: Date;
  endsAt: Date;
  bookedCount: number;
  capacityOverride: number | null;
  template: { capacity: number };
}

/** An hour in the past — the class has started, so attendance is recordable. */
const PAST = new Date(Date.now() - 60 * 60 * 1000);
const PAST_END = new Date(Date.now() - 30 * 60 * 1000);

const instance = (over?: Partial<InstanceRecord>): InstanceRecord => ({
  id: INSTANCE_ID,
  status: InstanceStatus.SCHEDULED,
  startsAt: PAST,
  endsAt: PAST_END,
  bookedCount: 2,
  capacityOverride: null,
  template: { capacity: 10 },
  ...over,
});

/** A held-seat booking row as ROSTER_BOOKING_SELECT projects it. */
const rosterBooking = (id: string, status: BookingStatus, name: string | null, email: string) => ({
  id,
  memberId: `gm-${id}`,
  status,
  createdAt: new Date('2025-12-30T09:00:00.000Z'),
  member: { user: { name, email } },
});

interface QueryArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

function setup(opts?: { transaction?: (cb: (tx: unknown) => unknown) => unknown }) {
  const booking = {
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    update: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
  };
  const classInstance = {
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    update: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
  };
  const $transaction = vi.fn<(cb: (tx: unknown) => unknown) => unknown>();
  const client = { booking, classInstance, $transaction };
  $transaction.mockImplementation(opts?.transaction ?? ((cb) => cb(client)));

  const prisma = { client } as unknown as TenantPrismaService;

  return {
    service: new AttendanceService(prisma),
    booking,
    classInstance,
    transaction: $transaction,
  };
}

describe('AttendanceService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('getRoster', () => {
    it('projects the held-seat bookings, seat totals and attendance tallies', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst.mockResolvedValueOnce(instance({ bookedCount: 3 }));
      ctx.booking.findMany.mockResolvedValueOnce([
        rosterBooking('bk-1', BookingStatus.ATTENDED, 'Ada Lovelace', 'ada@example.com'),
        rosterBooking('bk-2', BookingStatus.NO_SHOW, null, 'grace@example.com'),
        rosterBooking('bk-3', BookingStatus.BOOKED, 'Alan Turing', 'alan@example.com'),
      ]);

      const roster = await ctx.service.getRoster(INSTANCE_ID);

      expect(roster).toMatchObject({
        classInstanceId: INSTANCE_ID,
        status: InstanceStatus.SCHEDULED,
        capacity: 10,
        bookedCount: 3,
        attendedCount: 1,
        noShowCount: 1,
      });
      expect(roster.entries).toHaveLength(3);
      expect(roster.entries[0]).toEqual({
        bookingId: 'bk-1',
        memberId: 'gm-bk-1',
        memberName: 'Ada Lovelace',
        memberEmail: 'ada@example.com',
        status: BookingStatus.ATTENDED,
        bookedAt: '2025-12-30T09:00:00.000Z',
      });
      // The roster query excludes waitlisted / canceled bookings (held seats only).
      expect(ctx.booking.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
        classInstanceId: INSTANCE_ID,
        status: { in: [BookingStatus.BOOKED, BookingStatus.ATTENDED, BookingStatus.NO_SHOW] },
      });
    });

    it('honours a per-occurrence capacityOverride over the template capacity', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst.mockResolvedValueOnce(instance({ capacityOverride: 5 }));
      ctx.booking.findMany.mockResolvedValueOnce([]);

      const roster = await ctx.service.getRoster(INSTANCE_ID);

      expect(roster.capacity).toBe(5);
      expect(roster.entries).toEqual([]);
    });

    it('404s an unknown / cross-tenant occurrence', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst.mockResolvedValueOnce(null);

      const error = await ctx.service.getRoster(INSTANCE_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toMatchObject({
        code: 'CLASS_INSTANCE_NOT_FOUND',
      });
      expect(ctx.booking.findMany).not.toHaveBeenCalled();
    });
  });

  describe('markAttendance', () => {
    const mark = (entries: { bookingId: string; status: 'ATTENDED' | 'NO_SHOW' }[]) => ({
      entries,
    });

    it('marks each held seat, completes the occurrence, and returns the refreshed roster', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst.mockResolvedValueOnce(instance());
      ctx.booking.findFirst
        .mockResolvedValueOnce({ id: 'bk-1', status: BookingStatus.BOOKED })
        .mockResolvedValueOnce({ id: 'bk-2', status: BookingStatus.BOOKED });
      ctx.booking.update.mockResolvedValue({});
      ctx.classInstance.update.mockResolvedValueOnce({});
      ctx.booking.findMany.mockResolvedValueOnce([
        rosterBooking('bk-1', BookingStatus.ATTENDED, 'Ada', 'ada@example.com'),
        rosterBooking('bk-2', BookingStatus.NO_SHOW, 'Grace', 'grace@example.com'),
      ]);

      const roster = await ctx.service.markAttendance(
        INSTANCE_ID,
        mark([
          { bookingId: 'bk-1', status: 'ATTENDED' },
          { bookingId: 'bk-2', status: 'NO_SHOW' },
        ]),
      );

      expect(roster.status).toBe(InstanceStatus.COMPLETED);
      expect(roster).toMatchObject({ attendedCount: 1, noShowCount: 1 });
      // Each booking flips to its recorded outcome...
      expect(ctx.booking.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'bk-1' },
        data: { status: 'ATTENDED' },
      });
      expect(ctx.booking.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'bk-2' },
        data: { status: 'NO_SHOW' },
      });
      // ...and the occurrence is completed, all in one transaction.
      expect(ctx.classInstance.update).toHaveBeenCalledWith({
        where: { id: INSTANCE_ID },
        data: { status: InstanceStatus.COMPLETED },
      });
      expect(ctx.transaction).toHaveBeenCalledTimes(1);
    });

    it('re-marks an already-completed occurrence without re-completing it (idempotent correction)', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst.mockResolvedValueOnce(
        instance({ status: InstanceStatus.COMPLETED }),
      );
      ctx.booking.findFirst.mockResolvedValueOnce({ id: 'bk-1', status: BookingStatus.NO_SHOW });
      ctx.booking.update.mockResolvedValue({});
      ctx.booking.findMany.mockResolvedValueOnce([
        rosterBooking('bk-1', BookingStatus.ATTENDED, 'Ada', 'ada@example.com'),
      ]);

      const roster = await ctx.service.markAttendance(
        INSTANCE_ID,
        mark([{ bookingId: 'bk-1', status: 'ATTENDED' }]),
      );

      expect(roster.status).toBe(InstanceStatus.COMPLETED);
      expect(ctx.booking.update).toHaveBeenCalledOnce();
      // No redundant status write when the occurrence is already complete.
      expect(ctx.classInstance.update).not.toHaveBeenCalled();
    });

    it('404s an unknown / cross-tenant occurrence', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst.mockResolvedValueOnce(null);

      const error = await ctx.service
        .markAttendance(INSTANCE_ID, mark([{ bookingId: 'bk-1', status: 'ATTENDED' }]))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toMatchObject({
        code: 'CLASS_INSTANCE_NOT_FOUND',
      });
      expect(ctx.booking.update).not.toHaveBeenCalled();
    });

    it('409s a canceled occurrence (ATTENDANCE_NOT_AVAILABLE)', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst.mockResolvedValueOnce(
        instance({ status: InstanceStatus.CANCELED }),
      );

      const error = await ctx.service
        .markAttendance(INSTANCE_ID, mark([{ bookingId: 'bk-1', status: 'ATTENDED' }]))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'ATTENDANCE_NOT_AVAILABLE',
      });
      expect(ctx.booking.findFirst).not.toHaveBeenCalled();
      expect(ctx.booking.update).not.toHaveBeenCalled();
    });

    it('409s an occurrence that has not started yet (CLASS_NOT_STARTED)', async () => {
      const ctx = setup();
      const future = new Date(Date.now() + 60 * 60 * 1000);
      ctx.classInstance.findFirst.mockResolvedValueOnce(instance({ startsAt: future }));

      const error = await ctx.service
        .markAttendance(INSTANCE_ID, mark([{ bookingId: 'bk-1', status: 'ATTENDED' }]))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'CLASS_NOT_STARTED',
      });
      expect(ctx.booking.update).not.toHaveBeenCalled();
    });

    it('404s when a referenced booking is unknown / not on this occurrence (BOOKING_NOT_FOUND)', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst.mockResolvedValueOnce(instance());
      ctx.booking.findFirst.mockResolvedValueOnce(null);

      const error = await ctx.service
        .markAttendance(INSTANCE_ID, mark([{ bookingId: 'bk-x', status: 'ATTENDED' }]))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toMatchObject({
        code: 'BOOKING_NOT_FOUND',
      });
      expect(ctx.booking.update).not.toHaveBeenCalled();
    });

    it('409s a booking that held no seat — waitlisted (BOOKING_NOT_ATTENDABLE)', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst.mockResolvedValueOnce(instance());
      ctx.booking.findFirst.mockResolvedValueOnce({ id: 'bk-wl', status: BookingStatus.WAITLIST });

      const error = await ctx.service
        .markAttendance(INSTANCE_ID, mark([{ bookingId: 'bk-wl', status: 'ATTENDED' }]))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'BOOKING_NOT_ATTENDABLE',
      });
      expect(ctx.booking.update).not.toHaveBeenCalled();
    });

    it('records all-or-nothing — a bad booking in the batch blocks every write', async () => {
      const ctx = setup();
      ctx.classInstance.findFirst.mockResolvedValueOnce(instance());
      ctx.booking.findFirst
        .mockResolvedValueOnce({ id: 'bk-1', status: BookingStatus.BOOKED })
        .mockResolvedValueOnce(null); // second entry is unknown

      const error = await ctx.service
        .markAttendance(
          INSTANCE_ID,
          mark([
            { bookingId: 'bk-1', status: 'ATTENDED' },
            { bookingId: 'bk-x', status: 'NO_SHOW' },
          ]),
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      // Validation runs to completion before any update, so nothing is written.
      expect(ctx.booking.update).not.toHaveBeenCalled();
      expect(ctx.classInstance.update).not.toHaveBeenCalled();
    });
  });
});
