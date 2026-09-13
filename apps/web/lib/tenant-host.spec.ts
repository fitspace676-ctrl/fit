import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  browserTenantHeaders,
  requestGymSlug,
  resolveTenantHost,
  tenantHostHeaders,
} from './tenant-host';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'formacore.io');
  vi.stubEnv('NEXT_PUBLIC_DEV_GYM_SLUG', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveTenantHost', () => {
  it('is the public host behind the proxy', () => {
    expect(resolveTenantHost('downtown.formacore.io', 'fit-web.vercel.app')).toBe(
      'downtown.formacore.io',
    );
    expect(resolveTenantHost(null, 'downtown.formacore.io')).toBe('downtown.formacore.io');
  });

  it('passes a non-tenant host through for the API to judge', () => {
    expect(resolveTenantHost(null, 'app.formacore.io')).toBe('app.formacore.io');
  });

  it('spells the dev fallback as the host it stands in for', () => {
    vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'localhost');
    vi.stubEnv('NEXT_PUBLIC_DEV_GYM_SLUG', 'downtown');
    expect(resolveTenantHost(null, 'localhost:3001')).toBe('downtown.localhost');
  });

  it('never lets the dev fallback override a real tenant host', () => {
    vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'localhost');
    vi.stubEnv('NEXT_PUBLIC_DEV_GYM_SLUG', 'downtown');
    expect(resolveTenantHost(null, 'riverside.localhost:3001')).toBe('riverside.localhost:3001');
  });
});

describe('tenantHostHeaders', () => {
  it('names the host in x-tenant-host', () => {
    expect(tenantHostHeaders('downtown.formacore.io')).toEqual({
      'x-tenant-host': 'downtown.formacore.io',
    });
  });

  it('sends nothing without a host', () => {
    expect(tenantHostHeaders(null)).toEqual({});
  });
});

describe('browserTenantHeaders', () => {
  it('is empty on the server', () => {
    expect(browserTenantHeaders()).toEqual({});
  });

  it('reads the page host in the browser', () => {
    vi.stubGlobal('window', { location: { host: 'downtown.formacore.io' } });
    try {
      expect(browserTenantHeaders()).toEqual({ 'x-tenant-host': 'downtown.formacore.io' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('requestGymSlug', () => {
  it('is the slug the host names', () => {
    expect(requestGymSlug('downtown.formacore.io', 'fit-web.vercel.app')).toBe('downtown');
  });

  it('is null on hosts that name no tenant', () => {
    expect(requestGymSlug(null, 'app.formacore.io')).toBeNull();
    expect(requestGymSlug(null, 'fit-web.vercel.app')).toBeNull();
  });

  it('falls back to the dev slug', () => {
    vi.stubEnv('NEXT_PUBLIC_DEV_GYM_SLUG', 'downtown');
    expect(requestGymSlug(null, 'localhost:3001')).toBe('downtown');
  });
});
