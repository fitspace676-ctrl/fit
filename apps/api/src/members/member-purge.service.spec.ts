import { describe, expect, it, vi } from 'vitest';
import { Role } from '@fit/db';
import { MEMBER_TRASH_RETENTION_DAYS } from '@fit/types';
import { MemberPurgeService } from './member-purge.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Stub the unscoped Prisma + Redis deps; `deleteMany` returns a fixed purge count. */
function setup(deletedCount = 0) {
  const deleteMany = vi.fn<
    (args: { where: { role: Role; deletedAt: { lt: Date } } }) => Promise<{ count: number }>
  >(() => Promise.resolve({ count: deletedCount }));
  const prisma = { client: { gymMember: { deleteMany } } } as unknown as PrismaService;
  const redis = { client: { set: vi.fn() } } as unknown as RedisService;
  return { service: new MemberPurgeService(prisma, redis), deleteMany };
}

describe('MemberPurgeService.purgeExpired', () => {
  it('hard-deletes MEMBER rows trashed before the retention cutoff and returns the count', async () => {
    const { service, deleteMany } = setup(3);
    const now = new Date('2026-07-15T03:00:00.000Z');

    const purged = await service.purgeExpired(now);

    expect(purged).toBe(3);
    const where = deleteMany.mock.calls[0]?.[0]?.where as {
      role: Role;
      deletedAt: { lt: Date };
    };
    expect(where.role).toBe(Role.MEMBER);
    // Cutoff is exactly `now − retention days`; members trashed after it are kept.
    expect(where.deletedAt.lt).toEqual(
      new Date(now.getTime() - MEMBER_TRASH_RETENTION_DAYS * DAY_MS),
    );
  });

  it('reports zero when nothing is past the window', async () => {
    const { service } = setup(0);
    await expect(service.purgeExpired(new Date('2026-07-15T03:00:00.000Z'))).resolves.toBe(0);
  });
});
