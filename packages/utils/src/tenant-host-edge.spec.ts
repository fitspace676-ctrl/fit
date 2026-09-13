import { RESERVED_SUBDOMAINS } from '@fit/types';
import { describe, expect, it } from 'vitest';
import {
  EDGE_RESERVED_SUBDOMAINS,
  TENANT_HOST_HEADER,
  extractGymSlugEdge,
  isTenantMismatch,
  requestHost,
} from './tenant-host-edge';
import { extractGymSlug } from './tenant-host';

describe('EDGE_RESERVED_SUBDOMAINS', () => {
  it('mirrors RESERVED_SUBDOMAINS in @fit/types exactly', () => {
    // The copy exists only so middleware need not bundle @fit/types. If this
    // fails, a label was added to one list and not the other.
    expect([...EDGE_RESERVED_SUBDOMAINS].sort()).toEqual([...RESERVED_SUBDOMAINS].sort());
  });
});

describe('extractGymSlugEdge', () => {
  const cases: Array<[string | null | undefined, string | null | undefined]> = [
    ['downtown.formacore.io', 'formacore.io'],
    ['Downtown.FormaCore.io:443', 'formacore.io'],
    ['downtown.localhost:3001', 'localhost'],
    ['formacore.io', 'formacore.io'],
    ['app.formacore.io', 'formacore.io'],
    ['www.formacore.io', 'formacore.io'],
    ['superadmin.formacore.io', 'formacore.io'],
    ['a.b.formacore.io', 'formacore.io'],
    ['api-production-a2f4.up.railway.app', 'formacore.io'],
    ['fit-web.vercel.app', 'formacore.io'],
    ['downtown.formacore.io, proxy.internal', 'formacore.io'],
    [undefined, 'formacore.io'],
    ['downtown.formacore.io', undefined],
  ];

  it.each(cases)('agrees with extractGymSlug for %s under %s', (host, root) => {
    expect(extractGymSlugEdge(host, root)).toBe(extractGymSlug(host, root));
  });
});

describe('requestHost', () => {
  it('prefers the first x-forwarded-host entry', () => {
    expect(requestHost('downtown.formacore.io, fit-web.vercel.app', 'fit-web.vercel.app')).toBe(
      'downtown.formacore.io',
    );
  });

  it('falls back to host, keeping the port', () => {
    expect(requestHost(null, 'downtown.localhost:3001')).toBe('downtown.localhost:3001');
    expect(requestHost('  ', 'downtown.localhost:3001')).toBe('downtown.localhost:3001');
  });

  it('is null when neither header carries a value', () => {
    expect(requestHost(undefined, null)).toBeNull();
  });
});

describe('isTenantMismatch', () => {
  it('flags a session bound to another gym', () => {
    expect(isTenantMismatch('riverside', 'downtown')).toBe(true);
  });

  it('accepts the matching gym, case-insensitively', () => {
    expect(isTenantMismatch('downtown', 'downtown')).toBe(false);
    expect(isTenantMismatch('Downtown', 'downtown')).toBe(false);
  });

  it('never flags when either side has nothing to compare', () => {
    // A host with no tenant (apex, app.<root>, preview, Railway).
    expect(isTenantMismatch('downtown', null)).toBe(false);
    // A SUPER_ADMIN or pre-claim token.
    expect(isTenantMismatch(undefined, 'downtown')).toBe(false);
    expect(isTenantMismatch('', 'downtown')).toBe(false);
  });
});

it('names the header the API reads', () => {
  expect(TENANT_HOST_HEADER).toBe('x-tenant-host');
});
