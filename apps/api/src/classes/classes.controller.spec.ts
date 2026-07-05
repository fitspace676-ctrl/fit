import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import {
  CLASS_OCCUPANCY_EVENT,
  type ClassOccupancy,
  type GetClassInstanceResponse,
  type ListClassInstancesResponse,
} from '@fit/types';
import { ClassesController } from './classes.controller';
import type { ClassesService } from './classes.service';
import type { OccupancyStreamService } from '../live/occupancy-stream.service';

const FROM = '2026-06-01T00:00:00.000Z';
const TO = '2026-06-08T00:00:00.000Z';

const DETAIL: GetClassInstanceResponse = {
  instance: {
    id: 'ci-1',
    title: 'Morning Flow',
    description: 'A gentle vinyasa to start the day.',
    startsAt: FROM,
    endsAt: TO,
    trainerName: 'Nino Beridze',
    locationName: 'Vake Branch',
    room: 'Studio A',
    capacity: 12,
    bookedCount: 4,
    durationMinutes: 60,
    category: 'Yoga',
    color: '#2563eb',
    status: 'SCHEDULED',
  },
};

/** A live occupancy snapshot as the stream delivers it. */
const OCCUPANCY: ClassOccupancy = {
  classInstanceId: 'ci-1',
  capacity: 12,
  bookedCount: 5,
  available: 7,
  waitlistCount: 0,
  status: 'SCHEDULED',
  at: '2026-07-04T10:00:00.000Z',
};

function setup() {
  const listInstances = vi.fn<() => Promise<ListClassInstancesResponse>>(() =>
    Promise.resolve({ instances: [] }),
  );
  const getInstance = vi.fn<() => Promise<GetClassInstanceResponse>>(() => Promise.resolve(DETAIL));
  const classes = { listInstances, getInstance } as unknown as ClassesService;
  const stream = vi.fn<(gymId: string) => ReturnType<OccupancyStreamService['stream']>>(() =>
    of(OCCUPANCY),
  );
  const occupancy = { stream } as unknown as OccupancyStreamService;
  return {
    controller: new ClassesController(classes, occupancy),
    listInstances,
    getInstance,
    stream,
  };
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

  describe('GET /class-instances/:id', () => {
    it('parses the query and delegates the id + validated gymId to the service', async () => {
      const result = await ctx.controller.getOne('ci-1', { gymId: 'gym-1' });

      expect(ctx.getInstance).toHaveBeenCalledWith('ci-1', { gymId: 'gym-1' });
      expect(result).toEqual(DETAIL);
    });

    it('rejects a missing gymId with 400 without hitting the service', async () => {
      const error = await ctx.controller.getOne('ci-1', {}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.getInstance).not.toHaveBeenCalled();
    });
  });

  describe('GET /class-instances/occupancy/stream', () => {
    it('subscribes to the gym stream and emits each snapshot as a class.occupancy frame', async () => {
      const frame = await firstValueFrom(
        ctx.controller.streamOccupancy({ gymId: 'gym-1' }).pipe(
          filter((event) => event.type === CLASS_OCCUPANCY_EVENT),
          take(1),
        ),
      );

      expect(ctx.stream).toHaveBeenCalledWith('gym-1');
      expect(frame).toEqual({ type: CLASS_OCCUPANCY_EVENT, data: OCCUPANCY });
    });

    it('rejects a missing gymId with 400 without opening a stream', () => {
      expect(() => ctx.controller.streamOccupancy({})).toThrow(BadRequestException);
      expect(ctx.stream).not.toHaveBeenCalled();
    });
  });
});
