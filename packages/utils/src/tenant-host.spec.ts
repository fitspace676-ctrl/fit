import { describe, expect, it } from 'vitest';
import { extractGymSlug } from './tenant-host';

describe('extractGymSlug', () => {
  it('returns the single subdomain label under the root domain', () => {
    expect(extractGymSlug('downtown.fit.ge', 'fit.ge')).toBe('downtown');
    expect(extractGymSlug('riverside-fitness.fit.ge', 'fit.ge')).toBe('riverside-fitness');
  });

  it('lower-cases and strips the port from the host', () => {
    expect(extractGymSlug('Downtown.Fit.Ge:443', 'fit.ge')).toBe('downtown');
  });

  it('resolves against a dev root domain that carries a port', () => {
    expect(extractGymSlug('downtown.localhost:3001', 'localhost')).toBe('downtown');
    expect(extractGymSlug('downtown.localhost:3001', 'localhost:3001')).toBe('downtown');
  });

  it('returns null for the bare root domain or a www apex', () => {
    expect(extractGymSlug('fit.ge', 'fit.ge')).toBeNull();
    expect(extractGymSlug('www.fit.ge', 'fit.ge')).toBeNull();
  });

  it('returns null for a host not under the root domain', () => {
    expect(extractGymSlug('fit-web-xi.vercel.app', 'fit.ge')).toBeNull();
    expect(extractGymSlug('notfit.ge', 'fit.ge')).toBeNull();
  });

  it('returns null for a multi-level subdomain', () => {
    expect(extractGymSlug('a.b.fit.ge', 'fit.ge')).toBeNull();
  });

  it('returns null for reserved platform labels', () => {
    expect(extractGymSlug('api.fit.ge', 'fit.ge')).toBeNull();
    expect(extractGymSlug('admin.fit.ge', 'fit.ge')).toBeNull();
    expect(extractGymSlug('app.fit.ge', 'fit.ge')).toBeNull();
  });

  it('returns null for missing host or root domain', () => {
    expect(extractGymSlug(undefined, 'fit.ge')).toBeNull();
    expect(extractGymSlug('downtown.fit.ge', undefined)).toBeNull();
    expect(extractGymSlug('', 'fit.ge')).toBeNull();
  });
});
