import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { TrainersService } from './trainers.service';

type Args = Record<string, unknown>;

const trainerRow = {
  id: 'trainer-1',
  name: 'Nino Beridze',
  headline: 'Strength coach',
  bio: 'Ten years of coaching.',
  photoUrl: 'https://cdn/nino.jpg',
  specialties: ['Strength', 'Mobility'],
  staffId: 'gm-1',
  classTemplates: [
    { location: { name: 'Vake' } },
    { location: { name: 'Vake' } },
    { location: null },
  ],
};

function setup(
  over: { trainer?: typeof trainerRow | null; instances?: Args[]; slots?: Args[] } = {},
) {
  const findMany = vi.fn<(args: Args) => Promise<unknown[]>>(() => Promise.resolve([trainerRow]));
  const findFirst = vi.fn<(args: Args) => Promise<unknown>>(() =>
    Promise.resolve(over.trainer === undefined ? trainerRow : over.trainer),
  );
  const instanceFindMany = vi.fn<(args: Args) => Promise<unknown[]>>(() =>
    Promise.resolve(over.instances ?? []),
  );
  const slotFindMany = vi.fn<(args: Args) => Promise<unknown[]>>(() =>
    Promise.resolve(over.slots ?? []),
  );
  const prisma = {
    client: {
      trainer: { findMany, findFirst },
      classInstance: { findMany: instanceFindMany },
      serviceSession: { findMany: slotFindMany },
    },
  } as unknown as PrismaService;
  return { service: new TrainersService(prisma), findMany, findFirst, instanceFindMany };
}

describe('TrainersService.listTrainers', () => {
  it("lists the gym's ACTIVE trainers as cards with their studios", async () => {
    const { service, findMany } = setup();

    const result = await service.listTrainers({ gymId: 'gym-1' });

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { gymId: 'gym-1', status: 'ACTIVE' },
    });
    expect(result.trainers).toEqual([
      {
        id: 'trainer-1',
        name: 'Nino Beridze',
        headline: 'Strength coach',
        bio: 'Ten years of coaching.',
        avatarUrl: 'https://cdn/nino.jpg',
        specialties: ['Strength', 'Mobility'],
        locationNames: ['Vake'],
      },
    ]);
  });
});

describe('TrainersService.getTrainer', () => {
  it('returns the profile with upcoming classes and open service slots, by start', async () => {
    const { service, findFirst, instanceFindMany } = setup({
      slots: [
        {
          id: 'ss-1',
          serviceId: 's-1',
          startsAt: new Date('2026-09-01T10:00:00Z'),
          endsAt: new Date('2026-09-01T11:00:00Z'),
          service: { name: 'Personal session - Nino Beridze' },
        },
      ],
      instances: [
        {
          id: 'ci-1',
          startsAt: new Date('2026-09-01T14:00:00Z'),
          endsAt: new Date('2026-09-01T15:00:00Z'),
          template: { title: 'Strength 101' },
          classType: { name: 'Strength' },
          location: { name: 'Vake' },
        },
      ],
    });

    const result = await service.getTrainer('trainer-1', { gymId: 'gym-1' });

    expect(findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'trainer-1', gymId: 'gym-1', status: 'ACTIVE' },
    });
    expect(instanceFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { gymId: 'gym-1', trainerId: 'trainer-1', status: 'SCHEDULED' },
    });
    expect(result.trainer.schedule).toEqual([
      {
        id: 'ss-1',
        title: 'Personal session - Nino Beridze',
        startsAt: '2026-09-01T10:00:00.000Z',
        endsAt: '2026-09-01T11:00:00.000Z',
        locationName: '',
        kind: 'SERVICE',
        serviceId: 's-1',
      },
      {
        id: 'ci-1',
        title: 'Strength 101',
        startsAt: '2026-09-01T14:00:00.000Z',
        endsAt: '2026-09-01T15:00:00.000Z',
        locationName: 'Vake',
        kind: 'CLASS',
        serviceId: null,
      },
    ]);
  });

  it('is a 404 naming the trainer for an unknown or cross-tenant id', async () => {
    const { service } = setup({ trainer: null });
    await expect(service.getTrainer('trainer-9', { gymId: 'gym-1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.getTrainer('trainer-9', { gymId: 'gym-1' })).rejects.toThrow(
      'Trainer trainer-9 not found',
    );
  });
});
