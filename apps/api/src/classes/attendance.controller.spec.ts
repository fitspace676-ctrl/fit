import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import type { AttendanceService } from './attendance.service';
import type { AttendanceRoster } from '@fit/types';

const ROSTER: AttendanceRoster = {
  classInstanceId: 'ci-1',
  status: 'COMPLETED',
  startsAt: '2026-01-01T10:00:00.000Z',
  endsAt: '2026-01-01T11:00:00.000Z',
  capacity: 10,
  bookedCount: 2,
  attendedCount: 1,
  noShowCount: 1,
  entries: [
    {
      bookingId: 'bk-1',
      memberId: 'gm-1',
      memberName: 'Ada Lovelace',
      memberEmail: 'ada@example.com',
      status: 'ATTENDED',
      bookedAt: '2025-12-30T09:00:00.000Z',
    },
    {
      bookingId: 'bk-2',
      memberId: 'gm-2',
      memberName: null,
      memberEmail: 'grace@example.com',
      status: 'NO_SHOW',
      bookedAt: '2025-12-30T09:05:00.000Z',
    },
  ],
};

function setup() {
  const getRoster = vi.fn<() => Promise<AttendanceRoster>>(() => Promise.resolve(ROSTER));
  const markAttendance = vi.fn<() => Promise<AttendanceRoster>>(() => Promise.resolve(ROSTER));
  const attendance = { getRoster, markAttendance } as unknown as AttendanceService;
  return { controller: new AttendanceController(attendance), getRoster, markAttendance };
}

describe('AttendanceController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('GET /admin/class-instances/:id/attendance', () => {
    it('delegates the occurrence id to the service and returns the roster', async () => {
      const result = await ctx.controller.getRoster('ci-1');

      expect(ctx.getRoster).toHaveBeenCalledWith('ci-1');
      expect(result).toEqual(ROSTER);
    });
  });

  describe('POST /admin/class-instances/:id/attendance', () => {
    it('validates the body and delegates the parsed entries to the service', async () => {
      const body = { entries: [{ bookingId: 'bk-1', status: 'ATTENDED' }] };

      const result = await ctx.controller.mark('ci-1', body);

      expect(ctx.markAttendance).toHaveBeenCalledWith('ci-1', {
        entries: [{ bookingId: 'bk-1', status: 'ATTENDED' }],
      });
      expect(result).toEqual(ROSTER);
    });

    it('400s an empty entries list without hitting the service', async () => {
      const error = await ctx.controller.mark('ci-1', { entries: [] }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.markAttendance).not.toHaveBeenCalled();
    });

    it('400s an unknown attendance status without hitting the service', async () => {
      const body = { entries: [{ bookingId: 'bk-1', status: 'BOOKED' }] };

      const error = await ctx.controller.mark('ci-1', body).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.markAttendance).not.toHaveBeenCalled();
    });

    it('400s a duplicate bookingId without hitting the service', async () => {
      const body = {
        entries: [
          { bookingId: 'bk-1', status: 'ATTENDED' },
          { bookingId: 'bk-1', status: 'NO_SHOW' },
        ],
      };

      const error = await ctx.controller.mark('ci-1', body).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.markAttendance).not.toHaveBeenCalled();
    });

    it('400s a non-object body without hitting the service', async () => {
      const error = await ctx.controller.mark('ci-1', null).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.markAttendance).not.toHaveBeenCalled();
    });
  });
});
