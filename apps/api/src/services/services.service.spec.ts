import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { ServicesService } from './services.service';

const row = {
  id: 's-1',
  type: 'PERSONAL_TRAINING',
  name: 'Personal session - Nino Beridze',
  description: '',
  priceMinor: 5000,
  currency: 'GEL',
  durationMinutes: 60,
  coverUrl: null,
  category: { name: 'Boxing' },
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
      category: 'Boxing',
      staff: { id: 'gm-1', name: 'Nino Beridze', photoUrl: 'https://cdn/nino.jpg' },
    });
  });
});
