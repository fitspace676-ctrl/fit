import { describe, expect, it } from 'vitest';
import { deployArgs, logsArgs, vendorForApp } from './deploy';

describe('vendorForApp', () => {
  it('maps web clients to vercel', () => {
    for (const app of ['web', 'admin', 'platform', 'superadmin']) {
      expect(vendorForApp(app)).toBe('vercel');
    }
  });

  it('maps api to railway and mobile to eas', () => {
    expect(vendorForApp('api')).toBe('railway');
    expect(vendorForApp('mobile')).toBe('eas');
  });

  it('returns undefined for an unknown app', () => {
    expect(vendorForApp('nope')).toBeUndefined();
  });
});

describe('deployArgs', () => {
  it('adds --prod for vercel production deploys', () => {
    expect(deployArgs('vercel', false)).toEqual(['deploy']);
    expect(deployArgs('vercel', true)).toEqual(['deploy', '--prod']);
  });

  it('uses railway up and an eas profile', () => {
    expect(deployArgs('railway', true)).toEqual(['up']);
    expect(deployArgs('eas', true)).toContain('production');
    expect(deployArgs('eas', false)).toContain('preview');
  });
});

describe('logsArgs', () => {
  it('returns logs for vercel/railway', () => {
    expect(logsArgs('vercel')).toEqual(['logs']);
    expect(logsArgs('railway')).toEqual(['logs']);
  });
});
