import { describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env', () => ({ env: { PLATFORM_ROOT_DOMAIN: 'fit.ge' } }));

import { ForbiddenException } from '@nestjs/common';
import { assertSessionMatchesTenantHost } from './assert-tenant-host';

describe('assertSessionMatchesTenantHost', () => {
  it('403s TENANT_MISMATCH when the host names another gym than the session', () => {
    const error = (() => {
      try {
        assertSessionMatchesTenantHost({ host: 'riverside.fit.ge' }, { gymSlug: 'downtown' });
      } catch (e) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual({
      message: 'Session belongs to a different gym',
      code: 'TENANT_MISMATCH',
    });
  });

  it('compares against x-tenant-host / Forwarded, not the API’s own Host', () => {
    expect(() =>
      assertSessionMatchesTenantHost(
        { 'x-tenant-host': 'riverside.fit.ge', host: 'api-production.up.railway.app' },
        { gymSlug: 'downtown' },
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertSessionMatchesTenantHost(
        { forwarded: 'for=1.2.3.4;host=riverside.fit.ge', host: 'api.internal' },
        { gymSlug: 'downtown' },
      ),
    ).toThrow(ForbiddenException);
  });

  it('passes when the host and the session name the same gym', () => {
    expect(() =>
      assertSessionMatchesTenantHost({ host: 'Downtown.fit.ge:443' }, { gymSlug: 'downtown' }),
    ).not.toThrow();
  });

  it('passes on a host that names no tenant', () => {
    for (const host of ['api-production.up.railway.app', 'app.fit.ge', 'fit.ge', 'localhost']) {
      expect(() => assertSessionMatchesTenantHost({ host }, { gymSlug: 'downtown' })).not.toThrow();
    }
    expect(() => assertSessionMatchesTenantHost({}, { gymSlug: 'downtown' })).not.toThrow();
  });

  it('passes a SUPER_ADMIN / platform session, which carries no gymSlug', () => {
    expect(() => assertSessionMatchesTenantHost({ host: 'riverside.fit.ge' }, {})).not.toThrow();
  });

  it('passes a token issued before the claim existed (or an empty claim)', () => {
    expect(() =>
      assertSessionMatchesTenantHost({ host: 'riverside.fit.ge' }, { gymSlug: '' }),
    ).not.toThrow();
  });
});
