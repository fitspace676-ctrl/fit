import { describe, expect, it, vi } from 'vitest';
import type { ListAdminClassTypesQuery } from '@fit/types';
import { ClassTypesService } from './class-types.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

interface FindManyArgs {
  where?: { status?: unknown; name?: unknown; AND?: unknown };
  orderBy?: unknown;
  skip?: number;
  take?: number;
}

function setup() {
  const findMany = vi.fn<(args: FindManyArgs) => Promise<unknown[]>>(() => Promise.resolve([]));
  const count = vi.fn<(args: FindManyArgs) => Promise<number>>(() => Promise.resolve(0));
  const client = { classType: { findMany, count } } as unknown as Record<string, unknown>;
  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;
  return { service: new ClassTypesService(prisma, tenant), findMany, count };
}

const query = (over?: Partial<ListAdminClassTypesQuery>): ListAdminClassTypesQuery => ({
  page: 1,
  limit: 20,
  sort: 'name',
  dir: 'asc',
  ...over,
});

/**
 * The class-type roster carried NO branch param through Stages 1–6 — a recorded
 * exemption, because the only path to a branch was "has occurred at this branch".
 * Stage 7 gave `ClassType` a stored `locationId` meaning branch-EXCLUSIVE, so the
 * param is back with different semantics. These tests pin the semantics, not just
 * the presence of the filter.
 */
describe('ClassTypesService — branch availability', () => {
  it('narrows to a branch WITHOUT hiding the gym-wide types', async () => {
    const { service, findMany, count } = setup();

    await service.listClassTypes(query({ locationId: 'loc-1' }));

    expect(findMany.mock.calls[0]?.[0]?.where?.AND).toEqual({
      OR: [{ locationId: null }, { locationId: 'loc-1' }],
    });
    // The pager counts the same population or the totals lie about the page.
    expect(count.mock.calls[0]?.[0]?.where).toEqual(findMany.mock.calls[0]?.[0]?.where);
  });

  it('applies no branch predicate in all-locations mode', async () => {
    const { service, findMany } = setup();

    await service.listClassTypes(query());

    expect(findMany.mock.calls[0]?.[0]?.where?.AND).toBeUndefined();
  });

  it('never reaches a branch through the type occurrences', async () => {
    // The failure mode this stage exists to avoid: `instances: { some: { … } }`
    // answers "has been SCHEDULED at this branch", which hides a brand-new type
    // from everywhere and pins an old one to wherever it last ran.
    const { service, findMany } = setup();

    await service.listClassTypes(query({ locationId: 'loc-1' }));

    expect(findMany.mock.calls[0]?.[0]?.where).not.toHaveProperty('instances');
  });

  it('keeps the name search alongside the branch filter', async () => {
    const { service, findMany } = setup();

    await service.listClassTypes(query({ locationId: 'loc-1', search: 'yoga' }));

    const where = findMany.mock.calls[0]?.[0]?.where;
    expect(where?.AND).toEqual({ OR: [{ locationId: null }, { locationId: 'loc-1' }] });
    expect(where?.name).toEqual({ contains: 'yoga', mode: 'insensitive' });
  });
});
