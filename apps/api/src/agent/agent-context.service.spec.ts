import { describe, expect, it, vi } from 'vitest';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { RolePermissionsService } from '../common/rbac/role-permissions.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import { AgentContextService, isoDateIn } from './agent-context.service';

function setup(opts: { allowedLocationIds?: string[] | null } = {}) {
  const gymFind = vi.fn(() =>
    Promise.resolve({
      name: 'Downtown',
      slug: 'downtown',
      settings: { locale: { timezone: 'Asia/Tbilisi', currency: 'USD' } },
    }),
  );
  const locationFind = vi.fn(() =>
    Promise.resolve([
      { id: 'loc-a', name: 'Vake', status: 'ACTIVE' },
      { id: 'loc-b', name: 'Saburtalo', status: 'INACTIVE' },
    ]),
  );
  const userFind = vi.fn(() => Promise.resolve({ name: 'Nino' }));
  const prisma = {
    client: {
      gym: { findUnique: gymFind },
      location: { findMany: locationFind },
      user: { findUnique: userFind },
    },
  } as unknown as TenantPrismaService;
  const state = { gymId: 'gym-1', userId: 'user-1', role: 'MANAGER', allowCrossTenant: false };
  const tenant = { current: state, gymId: 'gym-1' } as unknown as TenantContext;
  const resolve = vi.fn(() =>
    Promise.resolve({
      role: 'MANAGER',
      grants: ['members.read'],
      branchScope: opts.allowedLocationIds ? 'assigned' : 'all',
      allowedLocationIds: opts.allowedLocationIds ?? null,
      defaultLocationId: null,
    }),
  );
  const access = { resolve } as unknown as RolePermissionsService;
  return { service: new AgentContextService(prisma, tenant, access), gymFind, locationFind };
}

describe('AgentContextService', () => {
  it('reads the gym and its branches by the session gym only', async () => {
    const ctx = setup();

    const context = await ctx.service.build({ locale: 'en' });

    expect(ctx.gymFind).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'gym-1' } }));
    expect(ctx.locationFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { gymId: 'gym-1' } }),
    );
    expect(context).toMatchObject({
      gym: { name: 'Downtown', slug: 'downtown', timezone: 'Asia/Tbilisi', currency: 'USD' },
      operator: { name: 'Nino', role: 'MANAGER', permissions: ['members.read'] },
      locale: 'en',
    });
    expect(context.locations.map((l) => l.id)).toEqual(['loc-a', 'loc-b']);
    expect(context.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('keeps a locationId that names one of the gym branches', async () => {
    const context = await setup().service.build({ locationId: 'loc-b' });

    expect(context.activeLocationId).toBe('loc-b');
  });

  it('ignores a locationId from another gym', async () => {
    const context = await setup().service.build({ locationId: 'other-gym-loc' });

    expect(context.activeLocationId).toBeUndefined();
  });

  it('narrows branches to the roster under assigned scope', async () => {
    const context = await setup({ allowedLocationIds: ['loc-a'] }).service.build({
      locationId: 'loc-b',
    });

    expect(context.locations.map((l) => l.id)).toEqual(['loc-a']);
    expect(context.activeLocationId).toBeUndefined();
  });
});

describe('isoDateIn', () => {
  it('formats the date in the given zone', () => {
    const now = new Date('2026-10-05T22:30:00Z');

    expect(isoDateIn('Asia/Tbilisi', now)).toBe('2026-10-06');
    expect(isoDateIn('UTC', now)).toBe('2026-10-05');
    expect(isoDateIn('Not/AZone', now)).toBe('2026-10-05');
  });
});
