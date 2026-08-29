import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { GymStatus } from '@fit/db';
import { DEFAULT_PRIMARY_COLOR, DEFAULT_SECONDARY_COLOR, DEFAULT_TIMEZONE } from '@fit/types';
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
  settings?: unknown;
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

  it('returns the public view of an active gym, with default brand, looked up by slug', async () => {
    const { service, findUnique } = setupBySubdomain({
      id: 'gym-1',
      name: 'Downtown Strength',
      status: GymStatus.ACTIVE,
    });

    await expect(service.resolveBySubdomain('downtown')).resolves.toEqual({
      gymId: 'gym-1',
      name: 'Downtown Strength',
      brand: {
        name: 'Downtown Strength',
        logoUrl: null,
        primaryColor: DEFAULT_PRIMARY_COLOR,
        secondaryColor: DEFAULT_SECONDARY_COLOR,
      },
      // A gym that has filled in no business info still answers with the four
      // fields, all null — the portal decides there is nothing to render.
      contact: { address: null, phone: null, email: null, website: null },
      // The zone the portal reads every class time in. A gym that has set none
      // answers with the platform default rather than omitting the field, so the
      // client never has to invent one.
      timezone: DEFAULT_TIMEZONE,
      // The portal's skin. A gym that has customised neither colour falls through
      // to the brand's, so the sign-in screen is always renderable; the sign-in
      // photograph stays null until one is uploaded, which the client reads as
      // "use the bundled hero image".
      portal: {
        loginImageUrl: null,
        primaryColor: DEFAULT_PRIMARY_COLOR,
        accentColor: DEFAULT_SECONDARY_COLOR,
      },
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'downtown' } }),
    );
  });

  it('surfaces the stored brand (logo + colours) when the gym has customised it', async () => {
    const { service } = setupBySubdomain({
      id: 'gym-1',
      name: 'Downtown Strength',
      status: GymStatus.ACTIVE,
      settings: {
        brand: {
          logoUrl: 'https://cdn.example.com/logo.png',
          primaryColor: '#ff0000',
          secondaryColor: '#00ff00',
        },
      },
    });

    await expect(service.resolveBySubdomain('downtown')).resolves.toMatchObject({
      brand: {
        name: 'Downtown Strength',
        logoUrl: 'https://cdn.example.com/logo.png',
        primaryColor: '#ff0000',
        secondaryColor: '#00ff00',
      },
    });
  });

  it('surfaces the gym’s own business contact details for the portal footer', async () => {
    const { service } = setupBySubdomain({
      id: 'gym-1',
      name: 'Downtown Strength',
      status: GymStatus.ACTIVE,
      settings: {
        business: {
          address: '12 Rustaveli Ave, Tbilisi',
          phone: '+995 322 00 00 00',
          email: 'hello@downtown.example',
          website: 'downtown.example',
        },
      },
    });

    await expect(service.resolveBySubdomain('downtown')).resolves.toMatchObject({
      contact: {
        address: '12 Rustaveli Ave, Tbilisi',
        phone: '+995 322 00 00 00',
        email: 'hello@downtown.example',
        website: 'downtown.example',
      },
    });
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
