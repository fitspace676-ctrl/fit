import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { GymStatus, Prisma, Role } from '@fit/db';
import { SuperAdminService } from './superadmin.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TokenService } from '../auth/token.service';

/** A gym row as `listGyms`'s projection returns it. */
interface GymRow {
  id: string;
  name: string;
  slug: string;
  status: GymStatus;
  _count: { members: number };
}

function setup(overrides?: {
  findMany?: GymRow[];
  update?: () => Promise<{ id: string; status: GymStatus }>;
  findUnique?: () => Promise<{ id: string; ownerId: string | null } | null>;
}) {
  const findMany = vi.fn<() => Promise<GymRow[]>>(() => Promise.resolve(overrides?.findMany ?? []));
  const update = vi.fn<() => Promise<{ id: string; status: GymStatus }>>(
    overrides?.update ?? (() => Promise.resolve({ id: 'gym-1', status: GymStatus.SUSPENDED })),
  );
  const findUnique = vi.fn<() => Promise<{ id: string; ownerId: string | null } | null>>(
    overrides?.findUnique ?? (() => Promise.resolve({ id: 'gym-1', ownerId: 'owner-1' })),
  );
  const auditCreate = vi.fn<(args: { data: Record<string, unknown> }) => Promise<{ id: string }>>(
    () => Promise.resolve({ id: 'audit-1' }),
  );

  const prisma = {
    client: {
      gym: { findMany, update, findUnique },
      auditLog: { create: auditCreate },
    },
  } as unknown as PrismaService;

  const signScopedAccessToken = vi.fn(() => 'scoped.jwt.token');
  const tokens = { signScopedAccessToken } as unknown as TokenService;

  return {
    service: new SuperAdminService(prisma, tokens),
    findMany,
    update,
    findUnique,
    auditCreate,
    signScopedAccessToken,
  };
}

describe('SuperAdminService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listGyms', () => {
    it('maps rows to admin summaries: slug→subdomainSlug, status, member count, mrr', async () => {
      const { service, findMany } = setup({
        findMany: [
          {
            id: 'gym-1',
            name: 'Downtown',
            slug: 'downtown',
            status: GymStatus.ACTIVE,
            _count: { members: 12 },
          },
          {
            id: 'gym-2',
            name: 'Uptown',
            slug: 'uptown',
            status: GymStatus.SUSPENDED,
            _count: { members: 0 },
          },
        ],
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
            mrr: 0,
          },
          {
            id: 'gym-2',
            name: 'Uptown',
            subdomainSlug: 'uptown',
            status: 'SUSPENDED',
            memberCount: 0,
            mrr: 0,
          },
        ],
      });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('returns an empty list when there are no gyms', async () => {
      const { service } = setup({ findMany: [] });
      await expect(service.listGyms()).resolves.toEqual({ gyms: [] });
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
    it('mints a gym-scoped OWNER token and writes exactly one audit row', async () => {
      const { service, signScopedAccessToken, auditCreate } = setup({
        findUnique: () => Promise.resolve({ id: 'gym-1', ownerId: 'owner-1' }),
      });

      const result = await service.impersonate('admin-1', 'gym-1');

      expect(result).toEqual({ accessToken: 'scoped.jwt.token' });
      expect(signScopedAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'owner-1', role: Role.OWNER, gymId: 'gym-1' }),
      );
      expect(auditCreate).toHaveBeenCalledOnce();
      expect(auditCreate.mock.calls[0]![0].data).toMatchObject({
        action: 'gym.impersonate',
        actorId: 'admin-1',
        gymId: 'gym-1',
        targetId: 'owner-1',
      });
    });

    it('404s for an unknown gym and never mints a token or audits', async () => {
      const { service, signScopedAccessToken, auditCreate } = setup({
        findUnique: () => Promise.resolve(null),
      });

      await expect(service.impersonate('admin-1', 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(signScopedAccessToken).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
    });

    it('422s for a gym with no owner', async () => {
      const { service, signScopedAccessToken } = setup({
        findUnique: () => Promise.resolve({ id: 'gym-1', ownerId: null }),
      });

      await expect(service.impersonate('admin-1', 'gym-1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(signScopedAccessToken).not.toHaveBeenCalled();
    });
  });
});
