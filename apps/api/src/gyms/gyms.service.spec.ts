import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { GymStatus } from '@fit/db';
import { GymsService } from './gyms.service';
import type { PrismaService } from '../prisma/prisma.service';

/** A gym row as `list`'s `findMany` projection returns it. */
interface GymRow {
  id: string;
  name: string;
  slug: string;
  ownerId: string | null;
  createdAt: Date;
  _count: { members: number };
}

function setup(rows: GymRow[]) {
  const findMany = vi.fn<(args: unknown) => Promise<GymRow[]>>(() => Promise.resolve(rows));
  const prisma = { client: { gym: { findMany } } } as unknown as PrismaService;
  return { service: new GymsService(prisma), findMany };
}

/** A gym row as `resolveBySubdomain`'s `findUnique` projection returns it. */
interface SubdomainRow {
  id: string;
  name: string;
  status: GymStatus;
}

function setupBySubdomain(row: SubdomainRow | null) {
  const findUnique = vi.fn<(args: unknown) => Promise<SubdomainRow | null>>(() =>
    Promise.resolve(row),
  );
  const prisma = { client: { gym: { findUnique } } } as unknown as PrismaService;
  return { service: new GymsService(prisma), findUnique };
}

describe('GymsService.list', () => {
  afterEach(() => vi.clearAllMocks());

  it('maps rows to summaries with member counts and ISO timestamps, newest first', async () => {
    const created = new Date('2026-01-02T03:04:05.000Z');
    const { service, findMany } = setup([
      {
        id: 'gym-1',
        name: 'Downtown Strength',
        slug: 'downtown',
        ownerId: 'owner-1',
        createdAt: created,
        _count: { members: 12 },
      },
    ]);

    const result = await service.list();

    expect(result).toEqual({
      gyms: [
        {
          id: 'gym-1',
          name: 'Downtown Strength',
          slug: 'downtown',
          ownerId: 'owner-1',
          memberCount: 12,
          createdAt: '2026-01-02T03:04:05.000Z',
        },
      ],
    });
    // Ordered newest-first and counting memberships.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('preserves a null ownerId for an unowned gym', async () => {
    const { service } = setup([
      {
        id: 'gym-2',
        name: 'Orphan Gym',
        slug: 'orphan',
        ownerId: null,
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        _count: { members: 0 },
      },
    ]);

    const result = await service.list();

    expect(result.gyms[0]).toMatchObject({ ownerId: null, memberCount: 0 });
  });

  it('returns an empty list when there are no gyms', async () => {
    const { service } = setup([]);
    await expect(service.list()).resolves.toEqual({ gyms: [] });
  });
});

describe('GymsService.resolveBySubdomain', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns the public view of an active gym, looked up by slug', async () => {
    const { service, findUnique } = setupBySubdomain({
      id: 'gym-1',
      name: 'Downtown Strength',
      status: GymStatus.ACTIVE,
    });

    await expect(service.resolveBySubdomain('downtown')).resolves.toEqual({
      gymId: 'gym-1',
      name: 'Downtown Strength',
      brand: null,
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'downtown' } }),
    );
  });

  it('throws 404 GYM_NOT_FOUND for an unknown slug', async () => {
    const { service } = setupBySubdomain(null);

    const error = await service.resolveBySubdomain('ghost').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'GYM_NOT_FOUND' });
  });

  it('throws 404 GYM_NOT_FOUND for a suspended gym (hidden from the public surface)', async () => {
    const { service } = setupBySubdomain({
      id: 'gym-9',
      name: 'Closed Club',
      status: GymStatus.SUSPENDED,
    });

    const error = await service.resolveBySubdomain('closed').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'GYM_NOT_FOUND' });
  });
});
