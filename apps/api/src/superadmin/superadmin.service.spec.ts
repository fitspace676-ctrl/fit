import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GymStatus, Prisma, Role } from '@fit/db';
import { SuperAdminService } from './superadmin.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { TokenService } from '../auth/token.service';

/** A gym row as `listGyms`'s projection returns it. */
interface GymRow {
  id: string;
  name: string;
  slug: string;
  status: GymStatus;
  createdAt: Date;
  ownerId: string | null;
  _count: { members: number };
}

/** An owner row as the batched second query returns it. */
interface OwnerRow {
  id: string;
  email: string;
  name: string | null;
}

function setup(overrides?: {
  findMany?: GymRow[];
  owners?: OwnerRow[];
  update?: () => Promise<{ id: string; status: GymStatus }>;
  findUnique?: () => Promise<{ id: string; ownerId: string | null } | null>;
  /** What a handoff-code lookup resolves to; `null` is "unknown or expired". */
  redisGet?: string | null;
  /** How many keys the consuming DEL removed — 0 means another request won. */
  redisDel?: number;
  /** The gym row the exchange re-reads, and the owner it resolves. */
  exchangeGym?: { id: string; name: string; slug: string } | null;
  exchangeOwner?: { email: string } | null;
}) {
  const findMany = vi.fn<() => Promise<GymRow[]>>(() => Promise.resolve(overrides?.findMany ?? []));
  const userFindMany = vi.fn<() => Promise<OwnerRow[]>>(() =>
    Promise.resolve(overrides?.owners ?? []),
  );
  const update = vi.fn<() => Promise<{ id: string; status: GymStatus }>>(
    overrides?.update ?? (() => Promise.resolve({ id: 'gym-1', status: GymStatus.SUSPENDED })),
  );
  const findUnique = vi.fn<() => Promise<{ id: string; ownerId: string | null } | null>>(
    overrides?.findUnique ?? (() => Promise.resolve({ id: 'gym-1', ownerId: 'owner-1' })),
  );
  const auditCreate = vi.fn<(args: { data: Record<string, unknown> }) => Promise<{ id: string }>>(
    () => Promise.resolve({ id: 'audit-1' }),
  );
  // The exchange path re-reads the gym through the same `findUnique` mock the
  // issue path uses, so it gets its own projection when the test supplies one.
  const userFindUnique = vi.fn<() => Promise<{ email: string } | null>>(() =>
    Promise.resolve(
      overrides?.exchangeOwner === undefined
        ? { email: 'alex@example.com' }
        : overrides.exchangeOwner,
    ),
  );

  const prisma = {
    client: {
      gym: { findMany, update, findUnique },
      user: { findMany: userFindMany, findUnique: userFindUnique },
      auditLog: { create: auditCreate },
    },
  } as unknown as PrismaService;

  const signScopedAccessToken = vi.fn(() => 'scoped.jwt.token');
  const tokens = { signScopedAccessToken } as unknown as TokenService;

  const redisSet = vi.fn(() => Promise.resolve('OK'));
  const redisGet = vi.fn<() => Promise<string | null>>(() =>
    Promise.resolve(overrides?.redisGet ?? null),
  );
  const redisDel = vi.fn<() => Promise<number>>(() => Promise.resolve(overrides?.redisDel ?? 1));
  const redis = {
    client: { set: redisSet, get: redisGet, del: redisDel },
  } as unknown as RedisService;

  return {
    service: new SuperAdminService(prisma, tokens, redis),
    findMany,
    userFindMany,
    userFindUnique,
    update,
    findUnique,
    auditCreate,
    signScopedAccessToken,
    redisSet,
    redisGet,
    redisDel,
  };
}

describe('SuperAdminService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listGyms', () => {
    it("maps rows to admin summaries, resolving each gym's owner", async () => {
      const { service, findMany, userFindMany } = setup({
        findMany: [
          {
            id: 'gym-1',
            name: 'Downtown',
            slug: 'downtown',
            status: GymStatus.ACTIVE,
            createdAt: new Date('2026-01-15T10:00:00.000Z'),
            ownerId: 'owner-1',
            _count: { members: 12 },
          },
          {
            id: 'gym-2',
            name: 'Uptown',
            slug: 'uptown',
            status: GymStatus.SUSPENDED,
            createdAt: new Date('2026-02-20T10:00:00.000Z'),
            ownerId: null,
            _count: { members: 0 },
          },
        ],
        owners: [{ id: 'owner-1', email: 'alex@example.com', name: 'Alex' }],
      });

      const result = await service.listGyms();

      expect(result).toEqual({
        gyms: [
          {
            id: 'gym-1',
            name: 'Downtown',
            subdomainSlug: 'downtown',
            status: 'ACTIVE',
            memberCount: 12,
            createdAt: '2026-01-15T10:00:00.000Z',
            owner: { email: 'alex@example.com', name: 'Alex' },
          },
          {
            id: 'gym-2',
            name: 'Uptown',
            subdomainSlug: 'uptown',
            status: 'SUSPENDED',
            memberCount: 0,
            createdAt: '2026-02-20T10:00:00.000Z',
            owner: null,
          },
        ],
      });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
      // One batched lookup for the whole roster, over the distinct owner ids only.
      expect(userFindMany).toHaveBeenCalledTimes(1);
      expect(userFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['owner-1'] } } }),
      );
    });

    it('reports no owner when the ownerId points at a user that no longer exists', async () => {
      const { service } = setup({
        findMany: [
          {
            id: 'gym-1',
            name: 'Downtown',
            slug: 'downtown',
            status: GymStatus.ACTIVE,
            createdAt: new Date('2026-01-15T10:00:00.000Z'),
            ownerId: 'ghost',
            _count: { members: 1 },
          },
        ],
        owners: [],
      });

      const { gyms } = await service.listGyms();
      expect(gyms[0]?.owner).toBeNull();
    });

    it('returns an empty list, and skips the owner lookup, when there are no gyms', async () => {
      const { service, userFindMany } = setup({ findMany: [] });
      await expect(service.listGyms()).resolves.toEqual({ gyms: [] });
      expect(userFindMany).not.toHaveBeenCalled();
    });
  });

  describe('setGymStatus', () => {
    it('updates the gym and writes one audit row, returning the new status', async () => {
      const { service, update, auditCreate } = setup({
        update: () => Promise.resolve({ id: 'gym-1', status: GymStatus.SUSPENDED }),
      });

      const result = await service.setGymStatus('admin-1', 'gym-1', GymStatus.SUSPENDED);

      expect(result).toEqual({ id: 'gym-1', status: 'SUSPENDED' });
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'gym-1' }, data: { status: GymStatus.SUSPENDED } }),
      );
      expect(auditCreate).toHaveBeenCalledOnce();
      expect(auditCreate.mock.calls[0]![0].data).toMatchObject({
        action: 'gym.status.update',
        actorId: 'admin-1',
        gymId: 'gym-1',
      });
    });

    it('maps a missing gym (P2025) to a 404', async () => {
      const { service, auditCreate } = setup({
        update: () =>
          Promise.reject(
            new Prisma.PrismaClientKnownRequestError('not found', {
              code: 'P2025',
              clientVersion: '6',
            }),
          ),
      });

      await expect(
        service.setGymStatus('admin-1', 'missing', GymStatus.ACTIVE),
      ).rejects.toBeInstanceOf(NotFoundException);
      // No audit row for a no-op update.
      expect(auditCreate).not.toHaveBeenCalled();
    });
  });

  describe('impersonate', () => {
    it('stores a single-use grant and audits the request, minting no token', async () => {
      const { service, redisSet, auditCreate, signScopedAccessToken } = setup({
        findUnique: () => Promise.resolve({ id: 'gym-1', ownerId: 'owner-1' }),
      });

      const result = await service.impersonate('admin-1', 'gym-1');

      expect(result.expiresInSeconds).toBe(60);
      expect(result.handoffCode).toEqual(expect.any(String));
      expect(result.handoffCode.length).toBeGreaterThan(16);
      // The code is what travels; nothing that authenticates anyone exists yet.
      expect(signScopedAccessToken).not.toHaveBeenCalled();

      expect(redisSet).toHaveBeenCalledWith(
        `impersonation:${result.handoffCode}`,
        JSON.stringify({ gymId: 'gym-1', ownerId: 'owner-1', actorId: 'admin-1' }),
        'EX',
        60,
      );
      expect(auditCreate).toHaveBeenCalledOnce();
      expect(auditCreate.mock.calls[0]![0].data).toMatchObject({
        action: 'gym.impersonate',
        actorId: 'admin-1',
        gymId: 'gym-1',
        targetId: 'owner-1',
      });
    });

    it('issues a fresh code every time', async () => {
      const { service } = setup({
        findUnique: () => Promise.resolve({ id: 'gym-1', ownerId: 'owner-1' }),
      });

      const first = await service.impersonate('admin-1', 'gym-1');
      const second = await service.impersonate('admin-1', 'gym-1');
      expect(first.handoffCode).not.toBe(second.handoffCode);
    });

    it('404s for an unknown gym, storing and auditing nothing', async () => {
      const { service, redisSet, auditCreate } = setup({
        findUnique: () => Promise.resolve(null),
      });

      await expect(service.impersonate('admin-1', 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(redisSet).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
    });

    it('422s for a gym with no owner, storing and auditing nothing', async () => {
      const { service, redisSet, auditCreate } = setup({
        findUnique: () => Promise.resolve({ id: 'gym-1', ownerId: null }),
      });

      await expect(service.impersonate('admin-1', 'gym-1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(redisSet).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
    });
  });

  describe('exchangeImpersonationCode', () => {
    const grant = JSON.stringify({ gymId: 'gym-1', ownerId: 'owner-1', actorId: 'admin-1' });

    it('consumes the code and mints a gym-scoped OWNER token', async () => {
      const { service, redisDel, signScopedAccessToken, auditCreate } = setup({
        redisGet: grant,
        findUnique: () =>
          Promise.resolve({ id: 'gym-1', name: 'Downtown', slug: 'downtown' } as never),
      });

      const result = await service.exchangeImpersonationCode('code-1');

      expect(result).toEqual({
        accessToken: 'scoped.jwt.token',
        expiresInSeconds: 600,
        gym: { id: 'gym-1', name: 'Downtown', subdomainSlug: 'downtown' },
        ownerEmail: 'alex@example.com',
      });
      expect(signScopedAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'owner-1', role: Role.OWNER, gymId: 'gym-1' }),
      );
      // Single use: the key is deleted as part of redeeming it.
      expect(redisDel).toHaveBeenCalledWith('impersonation:code-1');
      expect(auditCreate.mock.calls[0]![0].data).toMatchObject({
        action: 'gym.impersonate.start',
        actorId: 'admin-1',
        gymId: 'gym-1',
        targetId: 'owner-1',
      });
    });

    it('400s for an unknown or expired code', async () => {
      const { service, signScopedAccessToken } = setup({ redisGet: null });

      await expect(service.exchangeImpersonationCode('nope')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(signScopedAccessToken).not.toHaveBeenCalled();
    });

    it('400s when a concurrent redemption already consumed the code', async () => {
      // Both requests read the grant; the DEL decides, and this one removed nothing.
      const { service, signScopedAccessToken } = setup({ redisGet: grant, redisDel: 0 });

      await expect(service.exchangeImpersonationCode('code-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(signScopedAccessToken).not.toHaveBeenCalled();
    });

    it('404s when the gym disappeared between issue and redemption', async () => {
      const { service, signScopedAccessToken } = setup({
        redisGet: grant,
        findUnique: () => Promise.resolve(null),
      });

      await expect(service.exchangeImpersonationCode('code-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(signScopedAccessToken).not.toHaveBeenCalled();
    });
  });
});
