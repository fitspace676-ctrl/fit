import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => ({ mockEnv: { PLATFORM_ROOT_DOMAIN: 'fit.ge' } }));
vi.mock('../../config/env', () => ({ env: mockEnv }));

import { GymStatus, Role } from '@fit/db';
import type { NextFunction, Request, Response } from 'express';
import {
  SubdomainTenantMiddleware,
  extractTenantSlug,
  parseForwardedHost,
  resolveTenantHost,
  resolveTenantSlug,
} from './subdomain-tenant.middleware';
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

describe('parseForwardedHost', () => {
  it('reads host= from a single element', () => {
    expect(parseForwardedHost('for=192.0.2.60;proto=https;host=acme.fit.ge')).toBe('acme.fit.ge');
  });

  it('unquotes a quoted value and keeps its port for the slug extractor to strip', () => {
    expect(parseForwardedHost('for="[2001:db8::1]:4711";host="acme.fit.ge:443"')).toBe(
      'acme.fit.ge:443',
    );
  });

  it('matches the parameter name case-insensitively', () => {
    expect(parseForwardedHost('For=1.2.3.4;Host=acme.fit.ge')).toBe('acme.fit.ge');
  });

  it('takes the first hop of a multi-hop header', () => {
    expect(parseForwardedHost('for=1.2.3.4;host=acme.fit.ge, for=10.0.0.1;host=api.internal')).toBe(
      'acme.fit.ge',
    );
  });

  it('does not split the first element on a comma inside quotes', () => {
    expect(parseForwardedHost('for="a,b";host=acme.fit.ge, for=10.0.0.1;host=beta.fit.ge')).toBe(
      'acme.fit.ge',
    );
  });

  it('does not borrow host= from a later hop when the first names none', () => {
    expect(parseForwardedHost('for=1.2.3.4, for=10.0.0.1;host=acme.fit.ge')).toBeUndefined();
  });

  it('joins a repeated header before reading its first element', () => {
    expect(parseForwardedHost(['for=1.2.3.4;host=acme.fit.ge', 'host=beta.fit.ge'])).toBe(
      'acme.fit.ge',
    );
  });

  it('returns undefined for a missing header', () => {
    expect(parseForwardedHost(undefined)).toBeUndefined();
  });
});

describe('resolveTenantHost / resolveTenantSlug', () => {
  const root = 'fit.ge';

  it('prefers x-tenant-host over every other source', () => {
    const headers = {
      'x-tenant-host': 'acme.fit.ge',
      forwarded: 'host=beta.fit.ge',
      'x-forwarded-host': 'gamma.fit.ge',
      host: 'delta.fit.ge',
    };
    expect(resolveTenantHost(headers, root)).toBe('acme.fit.ge');
    expect(resolveTenantSlug(headers, root)).toBe('acme');
  });

  it('reads Forwarded host= ahead of x-forwarded-host and Host (the Railway edge shape)', () => {
    const headers = {
      forwarded: 'for=203.0.113.9;host="beta.fit.ge";proto=https',
      'x-forwarded-host': 'api-production.up.railway.app',
      host: 'api-production.up.railway.app',
    };
    expect(resolveTenantSlug(headers, root)).toBe('beta');
  });

  it('falls back to x-forwarded-host (first of a list), then Host', () => {
    expect(resolveTenantSlug({ 'x-forwarded-host': ['gamma.fit.ge', 'x'], host: 'h' }, root)).toBe(
      'gamma',
    );
    expect(resolveTenantSlug({ host: 'delta.fit.ge:3000' }, root)).toBe('delta');
  });

  it('skips an x-tenant-host under another root and uses the next source', () => {
    const headers = { 'x-tenant-host': 'acme.example.com', host: 'delta.fit.ge' };
    expect(resolveTenantHost(headers, root)).toBe('delta.fit.ge');
  });

  it('skips a reserved-label x-tenant-host and uses the next source', () => {
    const headers = { 'x-tenant-host': 'app.fit.ge', forwarded: 'host=beta.fit.ge' };
    expect(resolveTenantSlug(headers, root)).toBe('beta');
  });

  it('returns null when no source names a tenant', () => {
    const headers = {
      'x-tenant-host': 'fit.ge',
      forwarded: 'host=api.fit.ge',
      host: 'api-production.up.railway.app',
    };
    expect(resolveTenantHost(headers, root)).toBeNull();
    expect(resolveTenantSlug(headers, root)).toBeNull();
    expect(resolveTenantSlug({}, root)).toBeNull();
  });
});

describe('SubdomainTenantMiddleware', () => {
  afterEach(() => vi.clearAllMocks());

  it('resolves the tenant from x-tenant-host when the host is the API’s own', async () => {
    const { middleware, findUnique } = setup({ id: 'gym-3', status: GymStatus.ACTIVE });

    const { state } = await run(middleware, {
      'x-tenant-host': 'acme.fit.ge',
      host: 'api-production.up.railway.app',
    });

    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: 'acme' } }));
    expect(state?.gymId).toBe('gym-3');
  });

  it('resolves the tenant from an RFC 7239 Forwarded host', async () => {
    const { middleware, findUnique } = setup({ id: 'gym-4', status: GymStatus.ACTIVE });

    await run(middleware, { forwarded: 'for=1.2.3.4;host=beta.fit.ge', host: 'internal:3000' });

    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: 'beta' } }));
  });

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
