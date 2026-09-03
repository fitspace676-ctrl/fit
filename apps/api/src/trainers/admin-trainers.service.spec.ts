import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { TrainerStatus } from '@fit/db';
import {
  weeklyAvailabilitySchema,
  type CreateTrainerData,
  type ListAdminTrainersQuery,
  type UpdateTrainerData,
} from '@fit/types';
import { AdminTrainersService } from './admin-trainers.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { MediaCleanupService } from '../storage/media-cleanup.service';

/** A trainer row as the service's projection selects it. */
interface TrainerRecord {
  id: string;
  name: string;
  headline: string;
  bio: string;
  photoUrl: string | null;
  specialties: string[];
  status: TrainerStatus;
  createdAt: Date;
  updatedAt: Date;
  rating: number;
  reviewCount: number;
  availability?: unknown;
}

interface FindManyArgs {
  where?: { status?: unknown; OR?: unknown };
  orderBy?: unknown;
  skip?: number;
  take?: number;
}
interface WhereArgs {
  where?: { id?: unknown };
  data?: Record<string, unknown>;
}

const row = (over?: Partial<TrainerRecord>): TrainerRecord => ({
  id: 't-1',
  name: 'Giorgi Maisuradze',
  headline: 'Strength coach',
  bio: 'Ten years of powerlifting coaching.',
  photoUrl: null,
  specialties: ['Strength', 'Powerlifting'],
  status: TrainerStatus.ACTIVE,
  createdAt: new Date('2026-02-01T00:00:00.000Z'),
  updatedAt: new Date('2026-02-02T00:00:00.000Z'),
  rating: 4.9,
  reviewCount: 128,
  ...over,
});

function setup(overrides?: {
  findMany?: TrainerRecord[];
  count?: number;
  findFirst?: TrainerRecord | null;
}) {
  const findMany = vi.fn<(args: FindManyArgs) => Promise<TrainerRecord[]>>(() =>
    Promise.resolve(overrides?.findMany ?? []),
  );
  const count = vi.fn<(args: WhereArgs) => Promise<number>>(() =>
    Promise.resolve(overrides?.count ?? 0),
  );
  const findFirst = vi.fn<(args: WhereArgs) => Promise<TrainerRecord | null>>(() =>
    Promise.resolve(overrides?.findFirst ?? null),
  );
  const create = vi.fn<(args: WhereArgs) => Promise<TrainerRecord>>(() => Promise.resolve(row()));
  const update = vi.fn<(args: WhereArgs) => Promise<TrainerRecord>>(() => Promise.resolve(row()));

  // The enrichment (KPI summary, per-trainer classes/next-class, show-up rate,
  // this-week counts) reads other models. These permissive stubs let the list /
  // detail projections resolve without a live DB; each returns an "empty" figure,
  // so the tests below assert the projection shape via `toMatchObject`.
  const aggregate = vi.fn(() => Promise.resolve({ _avg: { rating: null } }));
  const classInstance = {
    findMany: vi.fn((_args: unknown) => Promise.resolve([] as unknown[])),
    count: vi.fn((_args: unknown) => Promise.resolve(0)),
  };
  const booking = {
    count: vi.fn((_args: unknown) => Promise.resolve(0)),
    findMany: vi.fn((_args: unknown) => Promise.resolve([] as unknown[])),
  };
  const review = { count: vi.fn(() => Promise.resolve(0)) };
  const serviceSession = {
    findMany: vi.fn((_args: unknown) => Promise.resolve([] as unknown[])),
  };
  // A coach's availability is mirrored onto their staff shift rows.
  const shiftSlot = {
    deleteMany: vi.fn((_args: unknown) => Promise.resolve({ count: 0 })),
    createMany: vi.fn((_args: unknown) => Promise.resolve({ count: 0 })),
  };

  // Staff ⇄ trainer link: a coach is created/renamed together with the
  // (login-less) staff record, so the writes run in one transaction over the
  // `user` / `gymMember` models too.
  const userCreate = vi.fn<(args: WhereArgs) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'u-1' }),
  );
  const userUpdate = vi.fn<(args: WhereArgs) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'u-1' }),
  );
  const gymMemberCreate = vi.fn<(args: WhereArgs) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'gm-1' }),
  );
  const gymMemberUpdate = vi.fn<(args: WhereArgs) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'gm-1' }),
  );
  const gymMemberFindFirst = vi.fn<(args: WhereArgs) => Promise<{ userId: string }>>(() =>
    Promise.resolve({ userId: 'u-1' }),
  );

  const client: Record<string, unknown> = {
    trainer: { findMany, count, findFirst, create, update, aggregate },
    user: { create: userCreate, update: userUpdate },
    gymMember: {
      create: gymMemberCreate,
      update: gymMemberUpdate,
      findFirst: gymMemberFindFirst,
    },
    classInstance,
    booking,
    review,
    serviceSession,
    shiftSlot,
  };
  // Interactive transactions hand the callback the same scoped client here — the
  // service only needs `tx` to expose the models it writes.
  client.$transaction = <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(client);

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;

  // Media cleanup is a best-effort side effect; stub it so these tests stay about
  // the service's own writes.
  const media = {
    discardUnreferenced: vi.fn(() => Promise.resolve()),
  } as unknown as MediaCleanupService;

  return {
    service: new AdminTrainersService(prisma, tenant, media),
    findMany,
    count,
    findFirst,
    create,
    update,
    userCreate,
    gymMemberCreate,
    gymMemberUpdate,
    classInstance,
    booking,
    serviceSession,
    shiftSlot,
  };
}

function query(overrides?: Partial<ListAdminTrainersQuery>): ListAdminTrainersQuery {
  return { page: 1, limit: 20, sort: 'name', dir: 'asc', ...overrides };
}

const createInput = (over?: Partial<CreateTrainerData>): CreateTrainerData => ({
  name: 'Giorgi Maisuradze',
  headline: 'Strength coach',
  bio: 'Ten years of powerlifting coaching.',
  photoUrl: null,
  specialties: ['Strength'],
  status: 'ACTIVE',
  availability: weeklyAvailabilitySchema.parse({}),
  ...over,
});

const updateInput = (over?: Partial<UpdateTrainerData>): UpdateTrainerData => ({
  name: 'Giorgi Maisuradze',
  headline: 'Head coach',
  bio: 'Updated bio.',
  photoUrl: 'https://cdn.example.com/g.jpg',
  specialties: ['Strength', 'Mobility'],
  ...over,
});

describe('AdminTrainersService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listTrainers', () => {
    it('projects rows to denormalised AdminTrainerRows and echoes pagination totals', async () => {
      const { service } = setup({ findMany: [row()], count: 1 });

      const result = await service.listTrainers(query());

      // Core projection (matchObject tolerates the additive KPI fields —
      // rating/reviewCount/classesThisWeek/nextClass — and the `summary` block).
      expect(result).toMatchObject({
        data: [
          {
            id: 't-1',
            name: 'Giorgi Maisuradze',
            headline: 'Strength coach',
            photoUrl: null,
            specialties: ['Strength', 'Powerlifting'],
            status: 'ACTIVE',
            createdAt: '2026-02-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('paginates server-side with skip/take derived from page + limit', async () => {
      const { service, findMany } = setup();

      await service.listTrainers(query({ page: 3, limit: 25 }));

      expect(findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 50, take: 25 });
    });

    it('adds a status filter when provided', async () => {
      const { service, findMany } = setup();

      await service.listTrainers(query({ status: 'INACTIVE' }));

      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ status: 'INACTIVE' });
    });

    it('builds a case-insensitive name/headline search', async () => {
      const { service, findMany } = setup();

      await service.listTrainers(query({ search: 'gio' }));

      expect(findMany.mock.calls[0]?.[0]?.where?.OR).toEqual([
        { name: { contains: 'gio', mode: 'insensitive' } },
        { headline: { contains: 'gio', mode: 'insensitive' } },
      ]);
    });

    it('maps the sort column + direction to a Prisma orderBy', async () => {
      const { service, findMany } = setup();

      await service.listTrainers(query({ sort: 'name', dir: 'desc' }));
      await service.listTrainers(query({ sort: 'status', dir: 'asc' }));
      await service.listTrainers(query({ sort: 'createdAt', dir: 'desc' }));

      // The roster query is the only `trainer.findMany` that carries an `orderBy`
      // (the KPI-summary's id lookup does not), so filter to those to stay robust
      // against the enrichment's interleaved calls.
      const orderBys = findMany.mock.calls
        .map((c) => c[0]?.orderBy)
        .filter((o): o is NonNullable<typeof o> => Boolean(o));
      expect(orderBys).toEqual([{ name: 'desc' }, { status: 'asc' }, { createdAt: 'desc' }]);
    });
  });

  describe('getTrainer', () => {
    it('returns the full detail projection', async () => {
      const { service } = setup({ findFirst: row() });

      const result = await service.getTrainer('t-1');

      // Core detail projection (matchObject tolerates the additive KPI fields —
      // rating/reviewCount/hiredAt/showUpRate/thisWeek).
      expect(result).toMatchObject({
        id: 't-1',
        name: 'Giorgi Maisuradze',
        headline: 'Strength coach',
        photoUrl: null,
        specialties: ['Strength', 'Powerlifting'],
        status: 'ACTIVE',
        createdAt: '2026-02-01T00:00:00.000Z',
        bio: 'Ten years of powerlifting coaching.',
        updatedAt: '2026-02-02T00:00:00.000Z',
      });
    });

    it('throws 404 TRAINER_NOT_FOUND for an unknown / cross-tenant id', async () => {
      const { service } = setup({ findFirst: null });

      await expect(service.getTrainer('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createTrainer', () => {
    it('stamps the tenant gymId and persists the profile fields', async () => {
      // `createTrainer` re-reads the created row via `getTrainer` to return the
      // enriched detail, so the mock must resolve that lookup.
      const { service, create } = setup({ findFirst: row() });

      await service.createTrainer(createInput({ name: 'New Coach', status: 'INACTIVE' }));

      expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
        gymId: 'gym-1',
        name: 'New Coach',
        headline: 'Strength coach',
        status: 'INACTIVE',
        specialties: ['Strength'],
      });
    });

    it('stores the opening working week on the trainer row', async () => {
      const { service, create } = setup({ findFirst: row() });
      const availability = weeklyAvailabilitySchema.parse({
        mon: { available: true, windows: [{ start: '09:00', end: '13:00' }] },
      });

      await service.createTrainer(createInput({ availability }));

      // The hours the Add-trainer drawer collected land in the same insert as
      // the profile, not in a follow-up PUT that could fail on its own.
      expect(create.mock.calls[0]?.[0]?.data).toMatchObject({ availability });
    });

    it('adds the coach to the staff directory and links the two', async () => {
      const { service, create, userCreate, gymMemberCreate } = setup({ findFirst: row() });

      await service.createTrainer(createInput({ name: 'Nino Beridze' }));

      // A login-less identity: the coach appears on the Staff roster with the
      // TRAINER role, but has no way to sign in until someone invites them.
      const userData = userCreate.mock.calls[0]?.[0]?.data as
        | { email?: string; name?: string }
        | undefined;
      expect(userData?.name).toBe('Nino Beridze');
      expect(userData?.email).toContain('@no-login.fit.local');
      expect(gymMemberCreate.mock.calls[0]?.[0]).toMatchObject({
        data: {
          gymId: 'gym-1',
          userId: 'u-1',
          role: 'TRAINER',
          status: 'ACTIVE',
          firstName: 'Nino',
          lastName: 'Beridze',
        },
      });
      expect(create.mock.calls[0]?.[0]?.data).toMatchObject({ staffId: 'gm-1' });
    });
  });

  describe('updateTrainer', () => {
    it('updates the profile fields (not status) and returns the detail', async () => {
      const { service, findFirst, update } = setup({ findFirst: row() });

      await service.updateTrainer('t-1', updateInput());

      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: 't-1' });
      const data = update.mock.calls[0]?.[0]?.data ?? {};
      expect(data).toMatchObject({
        name: 'Giorgi Maisuradze',
        headline: 'Head coach',
        photoUrl: 'https://cdn.example.com/g.jpg',
        specialties: ['Strength', 'Mobility'],
      });
      expect(data).not.toHaveProperty('status');
    });

    it('throws 404 for an unknown / cross-tenant id', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(service.updateTrainer('missing', updateInput())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('deactivateTrainer / reactivateTrainer', () => {
    it('sets the status to INACTIVE on deactivate', async () => {
      const { service, update } = setup({ findFirst: row() });

      await service.deactivateTrainer('t-1');

      expect(update.mock.calls[0]?.[0]).toMatchObject({
        where: { id: 't-1' },
        data: { status: TrainerStatus.INACTIVE },
      });
    });

    it('sets the status to ACTIVE on reactivate', async () => {
      const { service, update } = setup({ findFirst: row() });

      await service.reactivateTrainer('t-1');

      expect(update.mock.calls[0]?.[0]?.data).toMatchObject({ status: TrainerStatus.ACTIVE });
    });

    it('throws 404 for an unknown / cross-tenant id without updating', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(service.deactivateTrainer('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('getAvailability', () => {
    it('fills an empty stored availability to a complete fully-unavailable week', async () => {
      const { service } = setup({ findFirst: row({ availability: {} }) });

      const result = await service.getAvailability('t-1');

      expect(Object.keys(result.availability)).toEqual([
        'mon',
        'tue',
        'wed',
        'thu',
        'fri',
        'sat',
        'sun',
      ]);
      expect(result.availability.mon).toEqual({ available: false, windows: [] });
    });

    it('parses a stored partial week, defaulting absent days', async () => {
      const { service } = setup({
        findFirst: row({
          availability: { tue: { available: true, windows: [{ start: '09:00', end: '12:00' }] } },
        }),
      });

      const result = await service.getAvailability('t-1');

      expect(result.availability.tue).toEqual({
        available: true,
        windows: [{ start: '09:00', end: '12:00' }],
      });
      expect(result.availability.mon).toEqual({ available: false, windows: [] });
    });

    it('throws 404 for an unknown / cross-tenant id', async () => {
      const { service } = setup({ findFirst: null });

      await expect(service.getAvailability('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setAvailability', () => {
    it('persists the availability JSON after resolving the trainer, then returns it', async () => {
      const { service, findFirst, update } = setup({
        findFirst: row({
          availability: { mon: { available: true, windows: [{ start: '08:00', end: '10:00' }] } },
        }),
      });

      const result = await service.setAvailability('t-1', {
        availability: weeklyAvailabilitySchema.parse({
          mon: { available: true, windows: [{ start: '08:00', end: '10:00' }] },
        }),
      });

      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: 't-1' });
      expect(update.mock.calls[0]?.[0]).toMatchObject({ where: { id: 't-1' } });
      expect(update.mock.calls[0]?.[0]?.data).toHaveProperty('availability');
      expect(result.availability.mon).toEqual({
        available: true,
        windows: [{ start: '08:00', end: '10:00' }],
      });
    });

    it('throws 404 for an unknown / cross-tenant id without updating', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(
        service.setAvailability('missing', { availability: weeklyAvailabilitySchema.parse({}) }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });
  });
  describe('class figures resolve the occurrence trainer', () => {
    /**
     * A template-generated occurrence leaves `ClassInstance.trainerId` null and
     * carries its coach on the template; one scheduled from a class type on the
     * calendar sets `trainerId` and has no template. Matching only the template
     * shape - which is what these queries used to do - hides every calendar class
     * from the trainer's own page.
     */
    const bothShapes = {
      OR: [
        { trainerId: { in: ['t-1'] } },
        { trainerId: null, template: { trainerId: { in: ['t-1'] } } },
      ],
    };

    it('matches both occurrence shapes in every class query', async () => {
      const { service, classInstance } = setup({ findFirst: row() });

      await service.getTrainer('t-1');

      // `getTrainer` runs both the this-week count and the next-class lookup.
      expect(classInstance.findMany.mock.calls.length).toBeGreaterThan(0);
      for (const [args] of classInstance.findMany.mock.calls) {
        expect(args as { where: unknown }).toMatchObject({ where: bothShapes });
      }
    });

    it('keys the per-trainer map off the occurrence trainer, falling back to the template', async () => {
      const { service, findMany, classInstance } = setup({ findMany: [row({ id: 't-1' })] });
      // One stub serves both the week count and the next-class lookup, so the
      // rows need the `startsAt` the latter reads.
      const startsAt = new Date('2026-09-04T18:00:00.000Z');
      classInstance.findMany.mockResolvedValue([
        // Scheduled from a class type on the calendar.
        { trainerId: 't-1', template: null, classType: { name: 'Power Spin' }, startsAt },
        // Generated from a template.
        { trainerId: null, template: { trainerId: 't-1', title: 'Strength' }, startsAt },
      ]);

      const result = await service.listTrainers(query());

      expect(findMany).toHaveBeenCalled();
      expect(result.data[0]?.classesThisWeek).toBe(2);
    });

    it('reads the show-up rate over either shape', async () => {
      const { service, booking } = setup({ findFirst: row() });

      await service.getTrainer('t-1');

      const [args] = booking.count.mock.calls[0]!;
      expect(args as { where: { classInstance: unknown } }).toMatchObject({
        where: { classInstance: bothShapes },
      });
    });

    it('counts members trained over either shape', async () => {
      const { service, booking } = setup({ findFirst: row() });

      await service.getTrainer('t-1');

      const [args] = booking.findMany.mock.calls[0]!;
      expect(args as { where: { classInstance: unknown } }).toMatchObject({
        where: { classInstance: bothShapes },
      });
    });
  });
  describe('listClients', () => {
    /** A `ServiceSession` row as `listClients` selects it. */
    const session = (over?: Record<string, unknown>) => ({
      memberId: 'm-1',
      startsAt: new Date('2026-08-01T09:00:00.000Z'),
      status: 'COMPLETED',
      member: { id: 'm-1', firstName: 'Nino', lastName: 'Beridze', user: { name: null } },
      ...over,
    });

    /**
     * `listClients` reads the trainer only through `requireTrainer`, whose select
     * is `{ id, staffId, photoUrl }` - so stub that projection rather than a
     * roster row (`row()` models the roster select and carries no `staffId`).
     */
    function withSessions(rows: unknown[], staffId: string | null = 'gm-1') {
      const ctx = setup();
      ctx.findFirst.mockResolvedValue({
        id: 't-1',
        staffId,
        photoUrl: null,
      } as unknown as TrainerRecord);
      ctx.serviceSession.findMany.mockResolvedValue(rows);
      return ctx;
    }

    it('folds sessions into one row per member', async () => {
      const { service } = withSessions([
        session(),
        session({ startsAt: new Date('2026-08-08T09:00:00.000Z'), status: 'BOOKED' }),
      ]);

      const result = await service.listClients('t-1');

      expect(result.clients).toHaveLength(1);
      expect(result.clients[0]).toMatchObject({
        memberId: 'm-1',
        name: 'Nino Beridze',
        sessionCount: 2,
        completedCount: 1,
      });
      expect(result.totalSessions).toBe(2);
    });

    it("queries only this coach's booked and completed sessions", async () => {
      const { service, serviceSession } = withSessions([]);

      await service.listClients('t-1');

      expect(serviceSession.findMany.mock.calls[0]![0]).toMatchObject({
        where: {
          staffId: 'gm-1',
          memberId: { not: null },
          status: { in: ['BOOKED', 'COMPLETED'] },
        },
      });
    });

    it('returns an empty list without querying when the coach has no staff record', async () => {
      const { service, serviceSession } = withSessions([], null);

      const result = await service.listClients('t-1');

      // No `staffId` means no session can point at this coach - the query would
      // match every session in the gym, or none, depending on how null compares.
      expect(result).toEqual({ clients: [], totalSessions: 0 });
      expect(serviceSession.findMany).not.toHaveBeenCalled();
    });

    it('puts clients with an upcoming session first, soonest first', async () => {
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const later = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const { service } = withSessions([
        session({
          memberId: 'm-3',
          startsAt: past,
          status: 'COMPLETED',
          member: { id: 'm-3', firstName: 'Old', lastName: 'Client', user: { name: null } },
        }),
        session({
          memberId: 'm-2',
          startsAt: later,
          status: 'BOOKED',
          member: { id: 'm-2', firstName: 'Later', lastName: 'Client', user: { name: null } },
        }),
        session({
          memberId: 'm-1',
          startsAt: future,
          status: 'BOOKED',
          member: { id: 'm-1', firstName: 'Soon', lastName: 'Client', user: { name: null } },
        }),
      ]);

      const result = await service.listClients('t-1');

      expect(result.clients.map((client) => client.memberId)).toEqual(['m-1', 'm-2', 'm-3']);
      expect(result.clients[0]?.upcomingCount).toBe(1);
      expect(result.clients[2]?.nextSessionAt).toBeNull();
    });

    it('throws 404 TRAINER_NOT_FOUND for an unknown / cross-tenant id', async () => {
      const { service } = setup({ findFirst: null });

      await expect(service.listClients('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
  describe('availability mirrors to the staff shift schedule', () => {
    const workingWeek = () =>
      weeklyAvailabilitySchema.parse({
        mon: { available: true, windows: [{ start: '09:00', end: '13:00' }] },
        tue: {
          available: true,
          windows: [
            { start: '09:00', end: '12:00' },
            { start: '14:00', end: '18:00' },
          ],
        },
      });

    /** `requireTrainer` selects `{ id, staffId, photoUrl }` - stub that shape. */
    function withStaffId(staffId: string | null) {
      const ctx = setup({ findFirst: row() });
      ctx.findFirst.mockResolvedValue({
        id: 't-1',
        staffId,
        photoUrl: null,
      } as unknown as TrainerRecord);
      return ctx;
    }

    it("rewrites the coach's shift rows when availability is saved", async () => {
      const { service, shiftSlot } = withStaffId('gm-1');

      await service.setAvailability('t-1', { availability: workingWeek() });

      // Set-based, like the staff schedule editor: the whole week is replaced.
      expect(shiftSlot.deleteMany).toHaveBeenCalledWith({ where: { staffId: 'gm-1' } });
      const created = shiftSlot.createMany.mock.calls[0]![0] as {
        data: { dayOfWeek: number; startTime: string; endTime: string }[];
      };
      // 0 = Monday .. 6 = Sunday, and a split day yields one row per window.
      expect(created.data).toEqual([
        { gymId: 'gym-1', staffId: 'gm-1', dayOfWeek: 0, startTime: '09:00', endTime: '13:00' },
        { gymId: 'gym-1', staffId: 'gm-1', dayOfWeek: 1, startTime: '09:00', endTime: '12:00' },
        { gymId: 'gym-1', staffId: 'gm-1', dayOfWeek: 1, startTime: '14:00', endTime: '18:00' },
      ]);
    });

    it('writes the opening week to the shift schedule on create', async () => {
      const { service, shiftSlot } = setup({ findFirst: row() });

      await service.createTrainer(createInput({ availability: workingWeek() }));

      expect(shiftSlot.createMany).toHaveBeenCalled();
    });

    it('clears the shift rows for a fully unavailable week without an empty insert', async () => {
      const { service, shiftSlot } = withStaffId('gm-1');

      await service.setAvailability('t-1', { availability: weeklyAvailabilitySchema.parse({}) });

      expect(shiftSlot.deleteMany).toHaveBeenCalled();
      expect(shiftSlot.createMany).not.toHaveBeenCalled();
    });

    it('skips the mirror when the coach has no staff record', async () => {
      const { service, shiftSlot } = withStaffId(null);

      await service.setAvailability('t-1', { availability: workingWeek() });

      // ShiftSlot hangs off a GymMember; with no staff record there is nothing
      // to hang it on, and a `staffId: null` delete would not be scoped.
      expect(shiftSlot.deleteMany).not.toHaveBeenCalled();
    });
  });
});
