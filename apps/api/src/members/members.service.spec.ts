import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { GymMemberStatus, Role } from '@fit/db';
import type { ListMembersQuery } from '@fit/types';
import { MembersService } from './members.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

/** A membership row as the service's projection selects it. */
interface MemberRecord {
  id: string;
  status: GymMemberStatus;
  joinedAt: Date;
  user: { name: string | null; email: string };
}

/** The subset of a Prisma `findMany` arg shape the assertions inspect. */
interface FindManyArgs {
  where?: { role?: unknown; status?: unknown; user?: unknown };
  orderBy?: unknown;
  skip?: number;
  take?: number;
}
interface WhereArgs {
  where?: { id?: unknown; role?: unknown };
}

function setup(overrides?: {
  findMany?: MemberRecord[];
  count?: number;
  findFirst?: MemberRecord | null;
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

  const prisma = {
    client: { gymMember: { findMany, count, findFirst } },
  } as unknown as TenantPrismaService;

  return { service: new MembersService(prisma), findMany, count, findFirst };
}

/** Build a full query with defaults, overridable per test. */
function query(overrides?: Partial<ListMembersQuery>): ListMembersQuery {
  return { page: 1, limit: 20, sort: 'name', dir: 'asc', ...overrides };
}

const row = (over?: Partial<MemberRecord>): MemberRecord => ({
  id: 'gm-1',
  status: GymMemberStatus.ACTIVE,
  joinedAt: new Date('2026-01-15T00:00:00.000Z'),
  user: { name: 'Nino Beridze', email: 'nino@example.com' },
  ...over,
});

describe('MembersService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listMembers', () => {
    it('projects rows to denormalised MemberRows and echoes pagination totals', async () => {
      const { service } = setup({ findMany: [row()], count: 1 });

      const result = await service.listMembers(query());

      expect(result).toEqual({
        data: [
          {
            id: 'gm-1',
            name: 'Nino Beridze',
            email: 'nino@example.com',
            phone: null,
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
        findMany: [row({ user: { name: null, email: 'x@y.z' } })],
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
    it('returns the detail with empty deferred history tabs', async () => {
      const { service } = setup({ findFirst: row() });

      const result = await service.getMember('gm-1');

      expect(result).toEqual({
        id: 'gm-1',
        name: 'Nino Beridze',
        email: 'nino@example.com',
        phone: null,
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

  describe('bulkExport', () => {
    it('returns a jobId handle for the async export', async () => {
      const { service } = setup();

      const result = await service.bulkExport({ ids: ['gm-1', 'gm-2'] });

      expect(result.jobId).toEqual(expect.any(String));
      expect(result.jobId.length).toBeGreaterThan(0);
    });
  });
});
