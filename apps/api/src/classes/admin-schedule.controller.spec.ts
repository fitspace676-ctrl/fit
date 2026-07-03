import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { AdminClassInstanceDetail, AdminScheduleResponse } from '@fit/types';
import { AdminScheduleController } from './admin-schedule.controller';
import type { AdminScheduleService } from './admin-schedule.service';

const FROM = '2026-06-01T00:00:00.000Z';
const TO = '2026-06-08T00:00:00.000Z';

const detail = (over?: Partial<AdminClassInstanceDetail>): AdminClassInstanceDetail => ({
  id: 'ci-1',
  templateId: 'ct-1',
  title: 'Morning Flow',
  category: 'Yoga',
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
  const schedule = {
    listSchedule,
    getInstanceDetail,
    cancelInstance,
  } as unknown as AdminScheduleService;
  return {
    controller: new AdminScheduleController(schedule),
    listSchedule,
    getInstanceDetail,
    cancelInstance,
  };
}

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
});
