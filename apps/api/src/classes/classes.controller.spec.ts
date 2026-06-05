import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { ListClassInstancesResponse } from '@fit/types';
import { ClassesController } from './classes.controller';
import type { ClassesService } from './classes.service';

const FROM = '2026-06-01T00:00:00.000Z';
const TO = '2026-06-08T00:00:00.000Z';

function setup() {
  const listInstances = vi.fn<() => Promise<ListClassInstancesResponse>>(() =>
    Promise.resolve({ instances: [] }),
  );
  const classes = { listInstances } as unknown as ClassesService;
  return { controller: new ClassesController(classes), listInstances };
}

describe('ClassesController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('GET /class-instances', () => {
    it('parses the query and delegates the validated window to the service', async () => {
      const result = await ctx.controller.list({
        gymId: 'gym-1',
        from: FROM,
        to: TO,
        view: 'week',
      });

      expect(ctx.listInstances).toHaveBeenCalledWith({
        gymId: 'gym-1',
        from: FROM,
        to: TO,
        view: 'week',
      });
      expect(result).toEqual({ instances: [] });
    });

    it('allows an omitted view (it is an optional hint)', async () => {
      await ctx.controller.list({ gymId: 'gym-1', from: FROM, to: TO });

      expect(ctx.listInstances).toHaveBeenCalledWith({ gymId: 'gym-1', from: FROM, to: TO });
    });

    it('rejects a missing gymId with 400 without hitting the service', async () => {
      const error = await ctx.controller.list({ from: FROM, to: TO }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listInstances).not.toHaveBeenCalled();
    });

    it('rejects a non-ISO date bound with 400', async () => {
      const error = await ctx.controller
        .list({ gymId: 'gym-1', from: 'not-a-date', to: TO })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listInstances).not.toHaveBeenCalled();
    });

    it('rejects an inverted from/to range with 400', async () => {
      const error = await ctx.controller
        .list({ gymId: 'gym-1', from: TO, to: FROM })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listInstances).not.toHaveBeenCalled();
    });

    it('rejects an unknown view value with 400', async () => {
      const error = await ctx.controller
        .list({ gymId: 'gym-1', from: FROM, to: TO, view: 'month' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listInstances).not.toHaveBeenCalled();
    });
  });
});
