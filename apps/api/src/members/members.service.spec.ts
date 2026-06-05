import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { GymMemberStatus, Role } from '@fit/db';
import type { CreateMemberInput, ListMembersQuery } from '@fit/types';
import { MembersService } from './members.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

/** A membership row as the service's projection selects it (superset of every select). */
interface MemberRecord {
  id: string;
  userId: string;
  status: GymMemberStatus;
  joinedAt: Date;
  user: { name: string | null; email: string; phone: string | null };
}

/** The subset of a Prisma `findMany` arg shape the assertions inspect. */
interface FindManyArgs {
  where?: { role?: unknown; status?: unknown; user?: unknown };
  orderBy?: unknown;
  skip?: number;
  take?: number;
}
interface WhereArgs {
  where?: { id?: unknown; role?: unknown; userId?: unknown };
  data?: Record<string, unknown>;
}

function setup(overrides?: {
  findMany?: MemberRecord[];
  count?: number;
  findFirst?: MemberRecord | null;
  userFindUnique?: { id: string } | null;
  userCreate?: { id: string };
  gymMemberCreate?: MemberRecord;
}) {
  const findMany = vi.fn<(args: FindManyArgs) => Promise<MemberRecord[]>>(() =>
    Promise.resolve(overrides?.findMany ?? []),
  );
  const count = vi.fn<(args: WhereArgs) => Promise<number>>(() =>
    Promise.resolve(overrides?.count ?? 0),
  );
  const findFirst = vi.fn<(args: WhereArgs) => Promise<MemberRecord | null>>(() =>
    Promise.resolve(overrides?.findFirst ?? null),
  );
  const gymMemberCreate = vi.fn<(args: WhereArgs) => Promise<MemberRecord>>(() =>
    Promise.resolve(overrides?.gymMemberCreate ?? row()),
  );
  const gymMemberUpdate = vi.fn<(args: WhereArgs) => Promise<MemberRecord>>(() =>
    Promise.resolve(row()),
  );
  const userFindUnique = vi.fn<(args: WhereArgs) => Promise<{ id: string } | null>>(() =>
    Promise.resolve(overrides?.userFindUnique ?? null),
  );
  const userCreate = vi.fn<(args: WhereArgs) => Promise<{ id: string }>>(() =>
    Promise.resolve(overrides?.userCreate ?? { id: 'u-new' }),
  );
  const userUpdate = vi.fn<(args: WhereArgs) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'u-1' }),
  );

  const client: Record<string, unknown> = {
    user: { findUnique: userFindUnique, create: userCreate, update: userUpdate },
    gymMember: {
      findMany,
      count,
      findFirst,
      create: gymMemberCreate,
      update: gymMemberUpdate,
    },
  };
  // Interactive transaction: run the callback against the same scoped client.
  client.$transaction = vi.fn((cb: (tx: typeof client) => unknown) => cb(client));

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;

  return {
    service: new MembersService(prisma, tenant),
    findMany,
    count,
    findFirst,
    gymMemberCreate,
    gymMemberUpdate,
    userFindUnique,
    userCreate,
    userUpdate,
  };
}

/** Build a full list query with defaults, overridable per test. */
function query(overrides?: Partial<ListMembersQuery>): ListMembersQuery {
  return { page: 1, limit: 20, sort: 'name', dir: 'asc', ...overrides };
}

/** Build a full create body with defaults, overridable per test. */
function createInput(overrides?: Partial<CreateMemberInput>): CreateMemberInput {
  return {
    name: 'Nino Beridze',
    email: 'nino@example.com',
    phone: undefined,
    status: 'ACTIVE',
    ...overrides,
  };
}

const row = (over?: Partial<MemberRecord>): MemberRecord => ({
  id: 'gm-1',
  userId: 'u-1',
  status: GymMemberStatus.ACTIVE,
  joinedAt: new Date('2026-01-15T00:00:00.000Z'),
  user: { name: 'Nino Beridze', email: 'nino@example.com', phone: null },
  ...over,
});

describe('MembersService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listMembers', () => {
    it('projects rows to denormalised MemberRows and echoes pagination totals', async () => {
      const { service } = setup({
        findMany: [
          row({
            user: { name: 'Nino Beridze', email: 'nino@example.com', phone: '+995 555 10 20 30' },
          }),
        ],
        count: 1,
      });

      const result = await service.listMembers(query());

      expect(result).toEqual({
        data: [
          {
            id: 'gm-1',
            name: 'Nino Beridze',
            email: 'nino@example.com',
            phone: '+995 555 10 20 30',
            status: 'ACTIVE',
            planName: null,
            lastVisitAt: null,
            nextBillingAt: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('falls back to the email when the user has no name', async () => {
      const { service } = setup({
        findMany: [row({ user: { name: null, email: 'x@y.z', phone: null } })],
        count: 1,
      });

      const result = await service.listMembers(query());

      expect(result.data[0]?.name).toBe('x@y.z');
    });

    it('only ever lists MEMBER-role memberships', async () => {
      const { service, findMany, count } = setup();

      await service.listMembers(query());

      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ role: Role.MEMBER });
      expect(count.mock.calls[0]?.[0]?.where).toMatchObject({ role: Role.MEMBER });
    });

    it('paginates server-side with skip/take derived from page + limit', async () => {
      const { service, findMany } = setup();

      await service.listMembers(query({ page: 3, limit: 25 }));

      expect(findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 50, take: 25 });
    });

    it('adds a status filter when provided', async () => {
      const { service, findMany } = setup();

      await service.listMembers(query({ status: 'SUSPENDED' }));

      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ status: 'SUSPENDED' });
    });

    it('builds a case-insensitive name/email search', async () => {
      const { service, findMany } = setup();

      await service.listMembers(query({ search: 'nino' }));

      expect(findMany.mock.calls[0]?.[0]?.where?.user).toEqual({
        OR: [
          { name: { contains: 'nino', mode: 'insensitive' } },
          { email: { contains: 'nino', mode: 'insensitive' } },
        ],
      });
    });

    it('maps the sort column + direction to a Prisma orderBy', async () => {
      const { service, findMany } = setup();

      await service.listMembers(query({ sort: 'name', dir: 'desc' }));
      expect(findMany.mock.calls[0]?.[0]?.orderBy).toEqual({ user: { name: 'desc' } });

      await service.listMembers(query({ sort: 'status', dir: 'asc' }));
      expect(findMany.mock.calls[1]?.[0]?.orderBy).toEqual({ status: 'asc' });

      // lastVisitAt has no column yet → stable joinedAt fallback.
      await service.listMembers(query({ sort: 'lastVisitAt', dir: 'desc' }));
      expect(findMany.mock.calls[2]?.[0]?.orderBy).toEqual({ joinedAt: 'desc' });
    });
  });

  describe('getMember', () => {
    it('returns the detail with the projected phone and empty deferred history tabs', async () => {
      const { service } = setup({
        findFirst: row({
          user: { name: 'Nino Beridze', email: 'nino@example.com', phone: '+995 555' },
        }),
      });

      const result = await service.getMember('gm-1');

      expect(result).toEqual({
        id: 'gm-1',
        name: 'Nino Beridze',
        email: 'nino@example.com',
        phone: '+995 555',
        status: 'ACTIVE',
        planName: null,
        lastVisitAt: null,
        nextBillingAt: null,
        joinedAt: '2026-01-15T00:00:00.000Z',
        subscriptions: [],
        bookings: [],
        payments: [],
        notes: '',
      });
    });

    it('scopes the lookup to MEMBER-role rows', async () => {
      const { service, findFirst } = setup({ findFirst: row() });

      await service.getMember('gm-1');

      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: 'gm-1', role: Role.MEMBER });
    });

    it('throws 404 MEMBER_NOT_FOUND for an unknown / cross-tenant id', async () => {
      const { service } = setup({ findFirst: null });

      await expect(service.getMember('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createMember', () => {
    it('mints a new user + MEMBER membership when the email is unknown', async () => {
      const { service, userFindUnique, userCreate, gymMemberCreate } = setup({
        userFindUnique: null,
        userCreate: { id: 'u-new' },
        gymMemberCreate: row({ id: 'gm-new', userId: 'u-new' }),
      });

      const result = await service.createMember(
        createInput({
          name: 'New Person',
          email: 'new@example.com',
          phone: '555',
          status: 'INVITED',
        }),
      );

      expect(userFindUnique.mock.calls[0]?.[0]?.where).toMatchObject({ email: 'new@example.com' });
      expect(userCreate.mock.calls[0]?.[0]?.data).toMatchObject({
        name: 'New Person',
        email: 'new@example.com',
        phone: '555',
      });
      expect(gymMemberCreate.mock.calls[0]?.[0]?.data).toMatchObject({
        userId: 'u-new',
        role: Role.MEMBER,
        status: 'INVITED',
      });
      expect(result.id).toBe('gm-new');
      expect(result.subscriptions).toEqual([]);
    });

    it('links an existing user (no duplicate user) when the email is already known', async () => {
      const { service, userCreate, gymMemberCreate, findFirst } = setup({
        userFindUnique: { id: 'u-existing' },
        findFirst: null, // not yet a member of this gym
        gymMemberCreate: row({ id: 'gm-2', userId: 'u-existing' }),
      });

      await service.createMember(createInput({ email: 'existing@example.com' }));

      expect(userCreate).not.toHaveBeenCalled();
      // Duplicate check is scoped to this gym by the tenant extension.
      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({ userId: 'u-existing' });
      expect(gymMemberCreate.mock.calls[0]?.[0]?.data).toMatchObject({
        userId: 'u-existing',
        role: Role.MEMBER,
      });
    });

    it('throws 409 MEMBER_EXISTS when the person is already a member of this gym', async () => {
      const { service, gymMemberCreate } = setup({
        userFindUnique: { id: 'u-existing' },
        findFirst: row({ userId: 'u-existing' }),
      });

      await expect(service.createMember(createInput())).rejects.toBeInstanceOf(ConflictException);
      expect(gymMemberCreate).not.toHaveBeenCalled();
    });
  });

  describe('updateMember', () => {
    it('updates the member’s user name + phone and returns the detail', async () => {
      const { service, findFirst, userUpdate } = setup({ findFirst: row() });

      const result = await service.updateMember('gm-1', { name: 'Renamed', phone: '777' });

      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: 'gm-1', role: Role.MEMBER });
      expect(userUpdate.mock.calls[0]?.[0]).toMatchObject({
        where: { id: 'u-1' },
        data: { name: 'Renamed', phone: '777' },
      });
      expect(result.id).toBe('gm-1');
    });

    it('clears the phone when passed null', async () => {
      const { service, userUpdate } = setup({ findFirst: row() });

      await service.updateMember('gm-1', { name: 'Nino', phone: null });

      expect(userUpdate.mock.calls[0]?.[0]?.data).toMatchObject({ phone: null });
    });

    it('throws 404 for an unknown / cross-tenant id', async () => {
      const { service, userUpdate } = setup({ findFirst: null });

      await expect(
        service.updateMember('missing', { name: 'X', phone: null }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(userUpdate).not.toHaveBeenCalled();
    });
  });

  describe('deactivateMember / reactivateMember', () => {
    it('sets the status to SUSPENDED on deactivate', async () => {
      const { service, gymMemberUpdate } = setup({ findFirst: row() });

      await service.deactivateMember('gm-1');

      expect(gymMemberUpdate.mock.calls[0]?.[0]).toMatchObject({
        where: { id: 'gm-1' },
        data: { status: GymMemberStatus.SUSPENDED },
      });
    });

    it('sets the status to ACTIVE on reactivate', async () => {
      const { service, gymMemberUpdate } = setup({ findFirst: row() });

      await service.reactivateMember('gm-1');

      expect(gymMemberUpdate.mock.calls[0]?.[0]?.data).toMatchObject({
        status: GymMemberStatus.ACTIVE,
      });
    });

    it('throws 404 for an unknown / cross-tenant id without updating', async () => {
      const { service, gymMemberUpdate } = setup({ findFirst: null });

      await expect(service.deactivateMember('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(gymMemberUpdate).not.toHaveBeenCalled();
    });
  });

  describe('bulkExport', () => {
    it('returns a jobId handle for the async export', async () => {
      const { service } = setup();

      const result = await service.bulkExport({ ids: ['gm-1', 'gm-2'] });

      expect(result.jobId).toEqual(expect.any(String));
      expect(result.jobId.length).toBeGreaterThan(0);
    });
  });
});
