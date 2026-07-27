import { describe, expect, it, vi } from 'vitest';
import { PackageBillingInterval, PackagePlanStatus } from '@fit/db';
import type { ListPackagesQuery } from '@fit/types';
import type { PrismaService } from '../prisma/prisma.service';
import { PackagesService } from './packages.service';

/** A `PackagePlan` row shaped like the service's projection selects it. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pkg-1',
    name: '10 PT sessions',
    description: 'Ten one-to-one sessions',
    priceAmount: 45_000,
    currency: 'GEL',
    billingInterval: PackageBillingInterval.ONE_TIME,
    sessionCount: 10,
    features: ['Towel service'],
    popular: true,
    ...overrides,
  };
}

/** A `PrismaService` stub exposing only the one delegate the service touches. */
function prismaWith(findMany: ReturnType<typeof vi.fn>): PrismaService {
  return { client: { packagePlan: { findMany } } } as unknown as PrismaService;
}

describe('PackagesService', () => {
  it('lists only the gym’s ACTIVE plans, promoted then cheapest first', async () => {
    const findMany = vi.fn().mockResolvedValue([row()]);
    const service = new PackagesService(prismaWith(findMany));

    await service.listPackages({ gymId: 'gym-1' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gymId: 'gym-1', status: PackagePlanStatus.ACTIVE },
        orderBy: [{ popular: 'desc' }, { priceAmount: 'asc' }, { name: 'asc' }],
      }),
    );
  });

  it('maps the Prisma billing interval to the public lower-cased one', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        row({ id: 'a', billingInterval: PackageBillingInterval.MONTH }),
        row({ id: 'b', billingInterval: PackageBillingInterval.YEAR }),
        row({ id: 'c', billingInterval: PackageBillingInterval.ONE_TIME }),
      ]);
    const service = new PackagesService(prismaWith(findMany));

    const { packages } = await service.listPackages({ gymId: 'gym-1' });

    expect(packages.map((p) => p.interval)).toEqual(['month', 'year', 'one_time']);
  });

  it('projects a row to the public summary', async () => {
    const findMany = vi.fn().mockResolvedValue([row()]);
    const service = new PackagesService(prismaWith(findMany));

    const { packages } = await service.listPackages({ gymId: 'gym-1' });

    expect(packages).toEqual([
      {
        id: 'pkg-1',
        name: '10 PT sessions',
        description: 'Ten one-to-one sessions',
        priceAmount: 45_000,
        currency: 'GEL',
        interval: 'one_time',
        sessionCount: 10,
        features: ['Towel service'],
        popular: true,
      },
    ]);
  });

  it('accepts an optional location scope without narrowing (packages are gym-wide)', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new PackagesService(prismaWith(findMany));

    const query = { gymId: 'gym-1', locationId: 'loc-1' } as ListPackagesQuery;
    await expect(service.listPackages(query)).resolves.toEqual({ packages: [] });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { gymId: 'gym-1', status: PackagePlanStatus.ACTIVE } }),
    );
  });
});
