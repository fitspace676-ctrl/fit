import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ListAdminAuditLogQuery, ListAuditLogQuery } from '@fit/types';
import { AuditService } from './audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

/** An audit row as the service's projection selects it. */
interface AuditRecord {
  id: string;
  action: string;
  actorId: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  /** Only the platform feed selects this. */
  gymId?: string | null;
}

interface GymRecord {
  id: string;
  name: string;
  slug: string;
}

interface UserRecord {
  id: string;
  name: string | null;
  email: string;
}

/** The subset of the Prisma arg shapes the assertions inspect. */
interface FindManyArgs {
  where?: { gymId?: unknown; action?: unknown; createdAt?: { gte?: Date; lt?: Date } };
  orderBy?: unknown;
  skip?: number;
  take?: number;
}
interface UserFindManyArgs {
  where?: { id?: { in?: string[] } };
}

function setup(overrides?: {
  findMany?: AuditRecord[];
  count?: number;
  users?: UserRecord[];
  gyms?: GymRecord[];
}) {
  const findMany = vi.fn<(args: FindManyArgs) => Promise<AuditRecord[]>>(() =>
    Promise.resolve(overrides?.findMany ?? []),
  );
  const count = vi.fn<(args: FindManyArgs) => Promise<number>>(() =>
    Promise.resolve(overrides?.count ?? 0),
  );
  const userFindMany = vi.fn<(args: UserFindManyArgs) => Promise<UserRecord[]>>(() =>
    Promise.resolve(overrides?.users ?? []),
  );

  const gymFindMany = vi.fn<(args: { where?: { id?: { in?: string[] } } }) => Promise<GymRecord[]>>(
    () => Promise.resolve(overrides?.gyms ?? []),
  );

  const client = {
    auditLog: { findMany, count },
    user: { findMany: userFindMany },
    gym: { findMany: gymFindMany },
  };

  const prisma = { client } as unknown as PrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;

  return { service: new AuditService(prisma, tenant), findMany, count, userFindMany, gymFindMany };
}

/** Build a full platform query with defaults, overridable per test. */
function adminQuery(overrides?: Partial<ListAdminAuditLogQuery>): ListAdminAuditLogQuery {
  return { page: 1, limit: 20, ...overrides };
}

/** Build a full list query with defaults, overridable per test. */
function query(overrides?: Partial<ListAuditLogQuery>): ListAuditLogQuery {
  return { page: 1, limit: 20, ...overrides };
}

const row = (over?: Partial<AuditRecord>): AuditRecord => ({
  id: 'al-1',
  action: 'gym.impersonate',
  actorId: 'u-actor',
  targetId: 'u-target',
  metadata: { role: 'OWNER', ttlSeconds: 900 },
  createdAt: new Date('2026-02-01T10:30:00.000Z'),
  ...over,
});

describe('AuditService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listAuditLogs', () => {
    it('projects rows with resolved actor/target identities and echoes pagination', async () => {
      const { service } = setup({
        findMany: [row()],
        count: 1,
        users: [
          { id: 'u-actor', name: 'Ada Operator', email: 'ada@platform.io' },
          { id: 'u-target', name: 'Owen Owner', email: 'owen@gym.io' },
        ],
      });

      const result = await service.listAuditLogs(query());

      expect(result).toEqual({
        data: [
          {
            id: 'al-1',
            action: 'gym.impersonate',
            actorId: 'u-actor',
            actorName: 'Ada Operator',
            actorEmail: 'ada@platform.io',
            targetId: 'u-target',
            targetName: 'Owen Owner',
            targetEmail: 'owen@gym.io',
            metadata: { role: 'OWNER', ttlSeconds: 900 },
            createdAt: '2026-02-01T10:30:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('always pins the query to the caller’s gym, newest first', async () => {
      const { service, findMany, count } = setup();

      await service.listAuditLogs(query());

      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ gymId: 'gym-1' });
      expect(findMany.mock.calls[0]?.[0]?.orderBy).toEqual({ createdAt: 'desc' });
      expect(count.mock.calls[0]?.[0]?.where).toMatchObject({ gymId: 'gym-1' });
    });

    it('paginates server-side with skip/take derived from page + limit', async () => {
      const { service, findMany } = setup();

      await service.listAuditLogs(query({ page: 3, limit: 25 }));

      expect(findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 50, take: 25 });
    });

    it('adds an exact action filter when provided', async () => {
      const { service, findMany } = setup();

      await service.listAuditLogs(query({ action: 'gym.status.update' }));

      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ action: 'gym.status.update' });
    });

    it('translates from/to into an inclusive UTC instant range', async () => {
      const { service, findMany } = setup();

      await service.listAuditLogs(query({ from: '2026-02-01', to: '2026-02-28' }));

      const createdAt = findMany.mock.calls[0]?.[0]?.where?.createdAt;
      expect(createdAt?.gte).toEqual(new Date('2026-02-01T00:00:00.000Z'));
      // `to` is inclusive of the whole day → strictly before the next midnight.
      expect(createdAt?.lt).toEqual(new Date('2026-03-01T00:00:00.000Z'));
    });

    it('omits the date filter entirely when neither bound is given', async () => {
      const { service, findMany } = setup();

      await service.listAuditLogs(query());

      expect(findMany.mock.calls[0]?.[0]?.where?.createdAt).toBeUndefined();
    });

    it('resolves the distinct actor + target ids in a single user lookup', async () => {
      const { service, userFindMany } = setup({
        findMany: [
          row({ id: 'a', actorId: 'u-actor', targetId: 'u-target' }),
          row({ id: 'b', actorId: 'u-actor', targetId: null }),
        ],
        count: 2,
      });

      await service.listAuditLogs(query());

      const ids = userFindMany.mock.calls[0]?.[0]?.where?.id?.in ?? [];
      expect([...ids].sort()).toEqual(['u-actor', 'u-target']);
    });

    it('skips the user lookup and leaves identities null on an empty page', async () => {
      const { service, userFindMany } = setup({ findMany: [], count: 0 });

      const result = await service.listAuditLogs(query());

      expect(userFindMany).not.toHaveBeenCalled();
      expect(result.data).toEqual([]);
    });

    it('renders an unresolved actor (deleted user) and a null target as null', async () => {
      const { service } = setup({
        findMany: [row({ targetId: null, metadata: null })],
        count: 1,
        users: [], // actor no longer exists
      });

      const result = await service.listAuditLogs(query());

      expect(result.data[0]).toMatchObject({
        actorName: null,
        actorEmail: null,
        targetId: null,
        targetName: null,
        targetEmail: null,
        metadata: null,
      });
    });
  });

  describe('listPlatformAuditLogs', () => {
    it('spans every gym when none is named, and names the gym on each row', async () => {
      const { service, findMany, gymFindMany } = setup({
        findMany: [
          row({ id: 'al-1', gymId: 'gym-1' }),
          row({ id: 'al-2', gymId: 'gym-2', action: 'gym.status.update' }),
        ],
        count: 2,
        users: [{ id: 'u-actor', name: 'Ops', email: 'ops@example.com' }],
        gyms: [
          { id: 'gym-1', name: 'Downtown', slug: 'downtown' },
          { id: 'gym-2', name: 'Riverside', slug: 'riverside' },
        ],
      });

      const result = await service.listPlatformAuditLogs(adminQuery());

      // No gym constraint at all — that is what "platform-wide" means here.
      expect(findMany.mock.calls[0]![0].where?.gymId).toBeUndefined();
      expect(result.data[0]?.gym).toEqual({
        id: 'gym-1',
        name: 'Downtown',
        subdomainSlug: 'downtown',
      });
      expect(result.data[1]?.gym).toMatchObject({ subdomainSlug: 'riverside' });
      // One batched lookup for the page, not one per row.
      expect(gymFindMany).toHaveBeenCalledOnce();
    });

    it('narrows to one gym when the operator names it', async () => {
      const { service, findMany } = setup({ findMany: [], count: 0 });

      await service.listPlatformAuditLogs(adminQuery({ gymId: 'gym-2' }));

      expect(findMany.mock.calls[0]![0].where?.gymId).toBe('gym-2');
    });

    it('reports a null gym for an entry whose gym has been deleted', async () => {
      const { service } = setup({
        findMany: [row({ gymId: 'gone' })],
        count: 1,
        users: [],
        gyms: [],
      });

      const result = await service.listPlatformAuditLogs(adminQuery());
      expect(result.data[0]?.gym).toBeNull();
    });

    it('skips the gym lookup on an empty page', async () => {
      const { service, gymFindMany } = setup({ findMany: [], count: 0 });

      const result = await service.listPlatformAuditLogs(adminQuery());

      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
      expect(gymFindMany).not.toHaveBeenCalled();
    });

    it('applies the same paging and action filters as the gym-scoped feed', async () => {
      const { service, findMany } = setup();

      await service.listPlatformAuditLogs(
        adminQuery({ page: 3, limit: 10, action: 'gym.impersonate.start' }),
      );

      expect(findMany.mock.calls[0]![0]).toMatchObject({
        skip: 20,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
      expect(findMany.mock.calls[0]![0].where?.action).toBe('gym.impersonate.start');
    });
  });
});
