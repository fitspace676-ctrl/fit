import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { ServicesService } from './services.service';

const row = {
  id: 's-1',
  type: 'PERSONAL_TRAINING',
  name: 'Personal training - Nino Beridze',
  description: '',
  priceMinor: 5000,
  currency: 'GEL',
  durationMinutes: 60,
  coverUrl: null,
  schedule: {
    freq: 'WEEKLY',
    weekdays: ['MO', 'WE'],
    startDate: '2026-09-01',
    startTime: '18:00',
    until: null,
  },
  staff: {
    id: 'gm-1',
    firstName: 'Nino',
    lastName: 'Beridze',
    user: { name: 'nino@x' },
    trainerProfile: { photoUrl: 'https://cdn/nino.jpg' },
  },
};

describe('ServicesService.listServices', () => {
  it("lists only the gym's ACTIVE services, projected to portal cards", async () => {
    const findMany = vi.fn<(args: unknown) => Promise<unknown[]>>(() => Promise.resolve([row]));
    const prisma = { client: { service: { findMany } } } as unknown as PrismaService;

    const result = await new ServicesService(prisma).listServices({ gymId: 'gym-1' });

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { gymId: 'gym-1', status: 'ACTIVE' },
    });
    expect(result.services).toHaveLength(1);
    expect(result.services[0]).toMatchObject({
      id: 's-1',
      type: 'PERSONAL_TRAINING',
      schedule: { freq: 'WEEKLY', weekdays: ['MO', 'WE'] },
      staff: { id: 'gm-1', name: 'Nino Beridze', photoUrl: 'https://cdn/nino.jpg' },
    });
  });

  it('narrows to services whose staff member is rostered at the branch', async () => {
    const findMany = vi.fn<(args: unknown) => Promise<unknown[]>>(() => Promise.resolve([]));
    const prisma = { client: { service: { findMany } } } as unknown as PrismaService;

    await new ServicesService(prisma).listServices({ gymId: 'gym-1', locationId: 'loc-1' });

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        gymId: 'gym-1',
        status: 'ACTIVE',
        staff: { is: { locationAssignments: { some: { locationId: 'loc-1' } } } },
      },
    });
  });

  it('adds no roster predicate when no branch is resolved', async () => {
    const findMany = vi.fn<(args: { where: object }) => Promise<unknown[]>>(() =>
      Promise.resolve([]),
    );
    const prisma = { client: { service: { findMany } } } as unknown as PrismaService;

    await new ServicesService(prisma).listServices({ gymId: 'gym-1' });

    expect(findMany.mock.calls[0]![0].where).not.toHaveProperty('staff');
  });
});
