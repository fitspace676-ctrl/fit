import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { AdminScheduleResponse } from '@fit/types';
import { AdminScheduleController } from './admin-schedule.controller';
import type { AdminScheduleService } from './admin-schedule.service';

const FROM = '2026-06-01T00:00:00.000Z';
const TO = '2026-06-08T00:00:00.000Z';

function setup() {
  const listSchedule = vi.fn<() => Promise<AdminScheduleResponse>>(() =>
    Promise.resolve({ instances: [] }),
  );
  const schedule = { listSchedule } as unknown as AdminScheduleService;
  return { controller: new AdminScheduleController(schedule), listSchedule };
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
});
