import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => ({ mockEnv: { PLATFORM_ROOT_DOMAIN: 'fit.ge' } }));
vi.mock('../../config/env', () => ({ env: mockEnv }));

import { GymStatus, Role } from '@fit/db';
import type { NextFunction, Request, Response } from 'express';
import { SubdomainTenantMiddleware, extractTenantSlug } from './subdomain-tenant.middleware';
import { tenantStorage, type TenantState } from '../tenant/tenant.context';
import type { PrismaService } from '../../prisma/prisma.service';

interface GymRow {
  id: string;
  status: GymStatus;
}

function setup(gym: GymRow | null) {
  const findUnique = vi.fn<(args: unknown) => Promise<GymRow | null>>(() => Promise.resolve(gym));
  const prisma = { client: { gym: { findUnique } } } as unknown as PrismaService;
  return { middleware: new SubdomainTenantMiddleware(prisma), findUnique };
}

/** Run the middleware against a host/header set; capture the tenant store next() sees. */
async function run(
  middleware: SubdomainTenantMiddleware,
  headers: Record<string, string | string[]>,
): Promise<{ state: TenantState | undefined; nextCalled: boolean }> {
  const req = { headers } as unknown as Request;
  const res = {} as Response;
  let state: TenantState | undefined;
  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
    state = tenantStorage.getStore();
  };
  await middleware.use(req, res, next);
  return { state, nextCalled };
}

describe('extractTenantSlug', () => {
  const root = 'fit.ge';

  it('returns the single subdomain label of a tenant host', () => {
    expect(extractTenantSlug('acme.fit.ge', root)).toBe('acme');
  });

  it('lower-cases and strips the port', () => {
    expect(extractTenantSlug('ACME.FIT.GE:3000', root)).toBe('acme');
  });

  it('returns null for the bare root domain', () => {
    expect(extractTenantSlug('fit.ge', root)).toBeNull();
  });

  it('returns null for a reserved platform label', () => {
    expect(extractTenantSlug('www.fit.ge', root)).toBeNull();
    expect(extractTenantSlug('api.fit.ge', root)).toBeNull();
    expect(extractTenantSlug('admin.fit.ge', root)).toBeNull();
  });

  it('returns null for a multi-level subdomain', () => {
    expect(extractTenantSlug('a.b.fit.ge', root)).toBeNull();
  });

  it('returns null for a host outside the root domain', () => {
    expect(extractTenantSlug('acme.example.com', root)).toBeNull();
  });

  it('returns null for a missing host', () => {
    expect(extractTenantSlug(undefined, root)).toBeNull();
  });
});

describe('SubdomainTenantMiddleware', () => {
  afterEach(() => vi.clearAllMocks());

  it('resolves an active tenant subdomain into the tenant store with no JWT present', async () => {
    const { middleware, findUnique } = setup({ id: 'gym-1', status: GymStatus.ACTIVE });

    const { state, nextCalled } = await run(middleware, { host: 'acme.fit.ge' });

    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: 'acme' } }));
    expect(nextCalled).toBe(true);
    expect(state).toEqual({
      userId: null,
      gymId: 'gym-1',
      role: Role.MEMBER,
      allowCrossTenant: false,
    });
  });

  it('prefers x-forwarded-host over host', async () => {
    const { middleware, findUnique } = setup({ id: 'gym-2', status: GymStatus.ACTIVE });

    await run(middleware, { 'x-forwarded-host': 'beta.fit.ge', host: 'internal:3000' });

    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: 'beta' } }));
  });

  it('passes through without a tenant when an Authorization header is present (JWT wins)', async () => {
    const { middleware, findUnique } = setup({ id: 'gym-1', status: GymStatus.ACTIVE });

    const { state, nextCalled } = await run(middleware, {
      host: 'acme.fit.ge',
      authorization: 'Bearer token',
    });

    expect(nextCalled).toBe(true);
    expect(state).toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('passes through without a tenant when there is no tenant subdomain', async () => {
    const { middleware, findUnique } = setup({ id: 'gym-1', status: GymStatus.ACTIVE });

    const { state } = await run(middleware, { host: 'fit.ge' });

    expect(state).toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('passes through without a tenant for an unknown subdomain', async () => {
    const { middleware } = setup(null);

    const { state, nextCalled } = await run(middleware, { host: 'ghost.fit.ge' });

    expect(nextCalled).toBe(true);
    expect(state).toBeUndefined();
  });

  it('passes through without a tenant for a suspended gym', async () => {
    const { middleware } = setup({ id: 'gym-9', status: GymStatus.SUSPENDED });

    const { state } = await run(middleware, { host: 'closed.fit.ge' });

    expect(state).toBeUndefined();
  });
});
