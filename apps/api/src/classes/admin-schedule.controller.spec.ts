import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import {
  CLASS_OCCUPANCY_EVENT,
  type AdminClassInstanceDetail,
  type AdminScheduleResponse,
  type ClassOccupancy,
} from '@fit/types';
import { AdminScheduleController } from './admin-schedule.controller';
import type { AdminScheduleService } from './admin-schedule.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { OccupancyStreamService } from '../live/occupancy-stream.service';

const FROM = '2026-06-01T00:00:00.000Z';
const TO = '2026-06-08T00:00:00.000Z';

const detail = (over?: Partial<AdminClassInstanceDetail>): AdminClassInstanceDetail => ({
  id: 'ci-1',
  templateId: 'ct-1',
  classTypeId: null,
  title: 'Morning Flow',
  category: 'Yoga',
  description: 'A gentle start to the morning.',
  pricingRule: 'FREE',
  priceMinor: null,
  color: '#2563eb',
  startsAt: FROM,
  endsAt: TO,
  durationMinutes: 60,
  trainerName: 'Nino Beridze',
  locationName: 'Vake Branch',
  room: 'Studio A',
  capacity: 12,
  bookedCount: 0,
  status: 'SCHEDULED',
  waitlistCount: 0,
  roster: [],
  ...over,
});

function setup() {
  const listSchedule = vi.fn<() => Promise<AdminScheduleResponse>>(() =>
    Promise.resolve({ instances: [] }),
  );
  const getInstanceDetail = vi.fn<(id: string) => Promise<AdminClassInstanceDetail>>(() =>
    Promise.resolve(detail()),
  );
  const cancelInstance = vi.fn<(id: string) => Promise<AdminClassInstanceDetail>>(() =>
    Promise.resolve(detail({ status: 'CANCELED' })),
  );
  const promoteWaitlistEntry = vi.fn<
    (id: string, bookingId: string) => Promise<AdminClassInstanceDetail>
  >(() => Promise.resolve(detail({ bookedCount: 1 })));
  const bookMemberOntoClass = vi.fn<
    (id: string, memberId: string) => Promise<AdminClassInstanceDetail>
  >(() => Promise.resolve(detail({ bookedCount: 1 })));
  const schedule = {
    listSchedule,
    getInstanceDetail,
    cancelInstance,
    promoteWaitlistEntry,
    bookMemberOntoClass,
  } as unknown as AdminScheduleService;
  const stream = vi.fn<(gymId: string) => ReturnType<OccupancyStreamService['stream']>>(() =>
    of(OCCUPANCY),
  );
  const occupancy = { stream } as unknown as OccupancyStreamService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;
  return {
    controller: new AdminScheduleController(schedule, occupancy, tenant),
    listSchedule,
    getInstanceDetail,
    cancelInstance,
    promoteWaitlistEntry,
    bookMemberOntoClass,
    stream,
  };
}

/** A live occupancy snapshot as the stream delivers it. */
const OCCUPANCY: ClassOccupancy = {
  classInstanceId: 'ci-1',
  capacity: 12,
  bookedCount: 5,
  available: 7,
  waitlistCount: 2,
  status: 'SCHEDULED',
  at: '2026-07-04T10:00:00.000Z',
};

describe('AdminScheduleController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('GET /admin/schedule', () => {
    it('parses the query and delegates the validated window to the service', async () => {
      const result = await ctx.controller.list({ from: FROM, to: TO });

      expect(ctx.listSchedule).toHaveBeenCalledWith({ from: FROM, to: TO });
      expect(result).toEqual({ instances: [] });
    });

    it('passes optional trainer / location filters through', async () => {
      await ctx.controller.list({ from: FROM, to: TO, trainerId: 'tr-1', locationId: 'loc-2' });

      expect(ctx.listSchedule).toHaveBeenCalledWith({
        from: FROM,
        to: TO,
        trainerId: 'tr-1',
        locationId: 'loc-2',
      });
    });

    it('rejects a missing bound with 400 without hitting the service', async () => {
      const error = await ctx.controller.list({ from: FROM }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listSchedule).not.toHaveBeenCalled();
    });

    it('rejects a non-ISO date bound with 400', async () => {
      const error = await ctx.controller
        .list({ from: 'not-a-date', to: TO })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listSchedule).not.toHaveBeenCalled();
    });

    it('rejects an inverted from/to range with 400', async () => {
      const error = await ctx.controller.list({ from: TO, to: FROM }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listSchedule).not.toHaveBeenCalled();
    });

    it('rejects an over-wide window with 400', async () => {
      const error = await ctx.controller
        .list({ from: FROM, to: '2026-09-01T00:00:00.000Z' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listSchedule).not.toHaveBeenCalled();
    });

    it('rejects an empty trainerId filter with 400', async () => {
      const error = await ctx.controller
        .list({ from: FROM, to: TO, trainerId: '' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listSchedule).not.toHaveBeenCalled();
    });
  });

  describe('GET /admin/schedule/instances/:id', () => {
    it('delegates the id to the service and returns the detail', async () => {
      const result = await ctx.controller.getInstance('ci-1');

      expect(ctx.getInstanceDetail).toHaveBeenCalledWith('ci-1');
      expect(result).toMatchObject({ id: 'ci-1', roster: [], waitlistCount: 0 });
    });
  });

  describe('POST /admin/schedule/instances/:id/cancel', () => {
    it('delegates the id to the service and returns the canceled detail', async () => {
      const result = await ctx.controller.cancelInstance('ci-1');

      expect(ctx.cancelInstance).toHaveBeenCalledWith('ci-1');
      expect(result.status).toBe('CANCELED');
    });
  });

  describe('POST /admin/schedule/instances/:id/bookings/:bookingId/promote', () => {
    it('delegates the occurrence and booking ids to the service and returns the detail', async () => {
      const result = await ctx.controller.promoteWaitlist('ci-1', 'wl-1');

      expect(ctx.promoteWaitlistEntry).toHaveBeenCalledWith('ci-1', 'wl-1');
      expect(result.bookedCount).toBe(1);
    });
  });

  describe('POST /admin/schedule/instances/:id/bookings', () => {
    it('parses the body and delegates the occurrence + member id to the service', async () => {
      const result = await ctx.controller.bookMember('ci-1', { memberId: 'gm-7' });

      expect(ctx.bookMemberOntoClass).toHaveBeenCalledWith('ci-1', 'gm-7');
      expect(result.bookedCount).toBe(1);
    });

    it('rejects a missing memberId with 400 without hitting the service', async () => {
      const error = await ctx.controller.bookMember('ci-1', {}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.bookMemberOntoClass).not.toHaveBeenCalled();
    });

    it('rejects a blank memberId with 400', async () => {
      const error = await ctx.controller
        .bookMember('ci-1', { memberId: '' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.bookMemberOntoClass).not.toHaveBeenCalled();
    });
  });

  describe('GET /admin/schedule/stream', () => {
    it('subscribes to the caller gym stream and emits class.occupancy frames', async () => {
      const frame = await firstValueFrom(
        ctx.controller.streamOccupancy().pipe(
          filter((event) => event.type === CLASS_OCCUPANCY_EVENT),
          take(1),
        ),
      );

      // Scoped to the tenant context's gym, never a client-supplied id.
      expect(ctx.stream).toHaveBeenCalledWith('gym-1');
      expect(frame).toEqual({ type: CLASS_OCCUPANCY_EVENT, data: OCCUPANCY });
    });
  });
});
