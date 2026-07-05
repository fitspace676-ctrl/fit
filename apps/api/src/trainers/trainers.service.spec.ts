import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { TrainersService } from './trainers.service';

describe('TrainersService', () => {
  const service = new TrainersService();

  it('honours the wire contract with an empty roster until the model lands', async () => {
    await expect(service.listTrainers({ gymId: 'gym-1' })).resolves.toEqual({ trainers: [] });
  });

  it('resolves every id to a 404 while the roster is empty', async () => {
    await expect(service.getTrainer('trainer-1', { gymId: 'gym-1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('names the missing trainer in the 404 message', async () => {
    await expect(service.getTrainer('trainer-9', { gymId: 'gym-1' })).rejects.toThrow(
      'Trainer trainer-9 not found',
    );
  });
});
