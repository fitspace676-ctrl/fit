import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GymMemberStatus, Role } from '@fit/db';
import { tenantStorage, type TenantState } from '../tenant/tenant.context';
import { prisma, tenantPrisma, resetDb, disconnect } from '../../test/integration-db';

/**
 * Cross-tenant isolation, proven against a real Postgres through the actual
 * tenant Prisma extension (T2.7). This is the integration counterpart to the
 * unit tests of `scopeArgs`: it asserts the *whole* path — ALS tenant state →
 * extension → SQL — keeps one gym's rows unreachable from another, and that the
 * extension is load-bearing (the raw client, without it, sees everything).
 */

function state(gymId: string, role: Role = Role.OWNER): TenantState {
  return { userId: null, gymId, role, allowCrossTenant: false };
}

describe('tenant isolation (integration)', () => {
  let gymA: string;
  let gymB: string;

  beforeEach(async () => {
    await resetDb();
    const [a, b] = await Promise.all([
      prisma.gym.create({ data: { name: 'Gym A', slug: 'gym-a' } }),
      prisma.gym.create({ data: { name: 'Gym B', slug: 'gym-b' } }),
    ]);
    gymA = a.id;
    gymB = b.id;
    const [ua, ub] = await Promise.all([
      prisma.user.create({ data: { email: 'a@example.com' } }),
      prisma.user.create({ data: { email: 'b@example.com' } }),
    ]);
    await prisma.gymMember.createMany({
      data: [
        { userId: ua.id, gymId: gymA, role: Role.OWNER, status: GymMemberStatus.ACTIVE },
        { userId: ub.id, gymId: gymB, role: Role.OWNER, status: GymMemberStatus.ACTIVE },
      ],
    });
  });

  afterAll(disconnect);

  it('a gym-A request sees only gym-A members', async () => {
    const rows = await tenantStorage.run(state(gymA), () => tenantPrisma.gymMember.findMany({}));
    expect(rows).toHaveLength(1);
    expect(rows.every((r) => r.gymId === gymA)).toBe(true);
  });

  it('cannot reach gym-B rows even when it explicitly asks for gymB (filter is overwritten)', async () => {
    const rows = await tenantStorage.run(state(gymA), () =>
      tenantPrisma.gymMember.findMany({ where: { gymId: gymB } }),
    );
    expect(rows).toHaveLength(0);
  });

  it('overwrites the gym on create — a caller cannot insert into another tenant', async () => {
    const u = await prisma.user.create({ data: { email: 'c@example.com' } });
    const created = await tenantStorage.run(state(gymA), () =>
      // Ask to create in gym B while scoped to gym A; the extension forces gym A.
      tenantPrisma.gymMember.create({
        data: { userId: u.id, gymId: gymB, role: Role.MEMBER, status: GymMemberStatus.ACTIVE },
      }),
    );
    expect(created.gymId).toBe(gymA);
  });

  it('fails closed when no tenant is in scope', async () => {
    await expect(tenantPrisma.gymMember.findMany({})).rejects.toThrow();
  });

  it('is load-bearing: the RAW client (no extension) sees BOTH gyms — so the extension is what isolates', async () => {
    const all = await prisma.gymMember.findMany({});
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(new Set(all.map((r) => r.gymId))).toEqual(new Set([gymA, gymB]));
    // Sanity: the scoped client, for the same data, returns strictly fewer rows.
    const scoped = await tenantStorage.run(state(gymA), () => tenantPrisma.gymMember.findMany({}));
    expect(scoped.length).toBeLessThan(all.length);
  });
});
