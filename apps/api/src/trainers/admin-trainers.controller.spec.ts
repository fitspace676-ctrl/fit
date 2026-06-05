import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type {
  CreateTrainerResponse,
  GetAdminTrainerResponse,
  ListAdminTrainersResponse,
} from '@fit/types';
import { AdminTrainersController } from './admin-trainers.controller';
import type { AdminTrainersService } from './admin-trainers.service';

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
  ...over,
});

function setup() {
  const listTrainers = vi.fn<() => Promise<ListAdminTrainersResponse>>(() =>
    Promise.resolve({ data: [], total: 0, page: 1, limit: 20 }),
  );
  const getTrainer = vi.fn<() => Promise<GetAdminTrainerResponse>>(() => Promise.resolve(detail()));
  const createTrainer = vi.fn<() => Promise<CreateTrainerResponse>>(() =>
    Promise.resolve(detail()),
  );
  const updateTrainer = vi.fn<() => Promise<CreateTrainerResponse>>(() =>
    Promise.resolve(detail()),
  );
  const service = {
    listTrainers,
    getTrainer,
    createTrainer,
    updateTrainer,
  } as unknown as AdminTrainersService;
  return {
    controller: new AdminTrainersController(service),
    listTrainers,
    getTrainer,
    createTrainer,
    updateTrainer,
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
});
