import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  weeklyAvailabilitySchema,
  type CreateTrainerResponse,
  type GetAdminTrainerResponse,
  type GetTrainerAvailabilityResponse,
  type ListAdminTrainersResponse,
  type SetTrainerAvailabilityData,
  type SetTrainerAvailabilityResponse,
} from '@fit/types';
import { AdminTrainersController } from './admin-trainers.controller';
import type { AdminTrainersService } from './admin-trainers.service';

const emptyWeek = (): GetTrainerAvailabilityResponse => ({
  availability: weeklyAvailabilitySchema.parse({}),
});

const detail = (over?: Partial<GetAdminTrainerResponse>): GetAdminTrainerResponse => ({
  id: 't-1',
  name: 'Giorgi Maisuradze',
  headline: 'Strength coach',
  photoUrl: null,
  specialties: ['Strength'],
  status: 'ACTIVE',
  createdAt: '2026-02-01T00:00:00.000Z',
  bio: 'Bio.',
  updatedAt: '2026-02-01T00:00:00.000Z',
  rating: 4.9,
  reviewCount: 128,
  classesThisWeek: 12,
  nextClass: null,
  hiredAt: '2026-02-01T00:00:00.000Z',
  showUpRate: 0.96,
  thisWeek: { classesLed: 12, newReviews: 3, membersTrained: 146 },
  ...over,
});

function setup() {
  const listTrainers = vi.fn<() => Promise<ListAdminTrainersResponse>>(() =>
    Promise.resolve({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      summary: { total: 0, active: 0, classesPerWeek: 0, avgRating: 0 },
    }),
  );
  const getTrainer = vi.fn<() => Promise<GetAdminTrainerResponse>>(() => Promise.resolve(detail()));
  const createTrainer = vi.fn<() => Promise<CreateTrainerResponse>>(() =>
    Promise.resolve(detail()),
  );
  const updateTrainer = vi.fn<() => Promise<CreateTrainerResponse>>(() =>
    Promise.resolve(detail()),
  );
  const getAvailability = vi.fn<() => Promise<GetTrainerAvailabilityResponse>>(() =>
    Promise.resolve(emptyWeek()),
  );
  const setAvailability = vi.fn<
    (id: string, input: SetTrainerAvailabilityData) => Promise<SetTrainerAvailabilityResponse>
  >(() => Promise.resolve(emptyWeek()));
  const service = {
    listTrainers,
    getTrainer,
    createTrainer,
    updateTrainer,
    getAvailability,
    setAvailability,
  } as unknown as AdminTrainersService;
  return {
    controller: new AdminTrainersController(service),
    listTrainers,
    getTrainer,
    createTrainer,
    updateTrainer,
    getAvailability,
    setAvailability,
  };
}

describe('AdminTrainersController', () => {
  let ctx: ReturnType<typeof setup>;
  afterEach(() => vi.clearAllMocks());

  describe('GET /admin/trainers', () => {
    it('parses + defaults the query and delegates to the service', async () => {
      ctx = setup();
      await ctx.controller.list({ search: 'gio' });

      expect(ctx.listTrainers).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'gio', page: 1, limit: 20, sort: 'name', dir: 'asc' }),
      );
    });

    it('rejects a non-numeric page with 400 without hitting the service', async () => {
      ctx = setup();
      const error = await ctx.controller.list({ page: 'abc' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listTrainers).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/trainers', () => {
    it('validates + transforms the body before delegating', async () => {
      ctx = setup();
      await ctx.controller.create({ name: '  Giorgi  ', specialties: ['Strength', 'Strength'] });

      // Name trimmed, duplicate specialties de-duped, status defaulted.
      expect(ctx.createTrainer).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Giorgi', specialties: ['Strength'], status: 'ACTIVE' }),
      );
    });

    it('rejects a missing name with 400 without hitting the service', async () => {
      ctx = setup();
      const error = await ctx.controller.create({ headline: 'x' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createTrainer).not.toHaveBeenCalled();
    });

    it('rejects an invalid photo URL with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .create({ name: 'Giorgi', photoUrl: 'not-a-url' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createTrainer).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /admin/trainers/:id', () => {
    it('validates the body and forwards the id', async () => {
      ctx = setup();
      await ctx.controller.update('t-1', { name: 'Renamed' });

      expect(ctx.updateTrainer).toHaveBeenCalledWith(
        't-1',
        expect.objectContaining({ name: 'Renamed' }),
      );
    });
  });

  describe('GET /admin/trainers/:id/availability', () => {
    it('forwards the id to the service', async () => {
      ctx = setup();
      await ctx.controller.getAvailability('t-1');

      expect(ctx.getAvailability).toHaveBeenCalledWith('t-1');
    });
  });

  describe('PUT /admin/trainers/:id/availability', () => {
    it('validates + normalises the body before delegating', async () => {
      ctx = setup();
      await ctx.controller.setAvailability('t-1', {
        availability: {
          // Windows submitted out of order are sorted; an unavailable day's
          // windows are cleared — both asserted via the forwarded payload.
          mon: {
            available: true,
            windows: [
              { start: '14:00', end: '16:00' },
              { start: '09:00', end: '11:00' },
            ],
          },
          tue: { available: false, windows: [{ start: '09:00', end: '10:00' }] },
        },
      });

      const forwarded = ctx.setAvailability.mock.calls[0]?.[1];
      // Windows sorted ascending by start...
      expect(forwarded?.availability.mon.windows).toEqual([
        { start: '09:00', end: '11:00' },
        { start: '14:00', end: '16:00' },
      ]);
      // ...and an unavailable day's windows cleared to [].
      expect(forwarded?.availability.tue).toEqual({ available: false, windows: [] });
    });

    it('rejects overlapping windows with 400 without hitting the service', async () => {
      ctx = setup();
      const error = await ctx.controller
        .setAvailability('t-1', {
          availability: {
            mon: {
              available: true,
              windows: [
                { start: '09:00', end: '12:00' },
                { start: '11:00', end: '13:00' },
              ],
            },
          },
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.setAvailability).not.toHaveBeenCalled();
    });

    it('rejects an available day with no windows with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .setAvailability('t-1', { availability: { mon: { available: true, windows: [] } } })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.setAvailability).not.toHaveBeenCalled();
    });

    it('rejects an end time before the start time with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .setAvailability('t-1', {
          availability: { mon: { available: true, windows: [{ start: '12:00', end: '09:00' }] } },
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.setAvailability).not.toHaveBeenCalled();
    });
  });
});
