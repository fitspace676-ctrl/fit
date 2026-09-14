import { describe, expect, it } from 'vitest';
import { assertSafeSeedTarget, unsafeSeedTargetReason } from './seed-guard';

const local = 'postgresql://postgres:postgres@localhost:5432/fit?schema=public';

describe('seed guard', () => {
  it('refuses a production database URL', () => {
    for (const url of [
      'postgresql://postgres:secret@postgres.railway.internal:5432/railway',
      'postgresql://postgres:secret@shinkansen.proxy.rlwy.net:41234/railway',
      'postgresql://u:p@db.example.com:5432/fit',
    ]) {
      expect(() => assertSafeSeedTarget('seed', { DATABASE_URL: url })).toThrow(/refusing to seed/);
    }
  });

  it('refuses when NODE_ENV is production, even on localhost', () => {
    expect(() =>
      assertSafeSeedTarget('seed', { NODE_ENV: 'production', DATABASE_URL: local }),
    ).toThrow(/NODE_ENV is "production"/);
  });

  it('refuses a URL it cannot parse', () => {
    expect(unsafeSeedTargetReason({ DATABASE_URL: 'not a url' })).toMatch(/not a parseable URL/);
  });

  it('allows local and container hosts (CI + dev)', () => {
    for (const url of [
      local,
      'postgresql://postgres:postgres@localhost:5432/fit_test?schema=public',
      'postgresql://postgres:postgres@127.0.0.1:5432/fit',
      'postgresql://postgres:postgres@[::1]:5432/fit',
      'postgresql://postgres:postgres@postgres:5432/fit',
      'postgresql://postgres:postgres@db:5432/fit',
      'postgresql://postgres:postgres@pg-test:5432/fit',
      'postgresql:///fit?host=/var/run/postgresql',
    ]) {
      expect(assertSafeSeedTarget('seed', { NODE_ENV: 'test', DATABASE_URL: url })).toBe(false);
    }
    expect(assertSafeSeedTarget('seed', {})).toBe(false);
  });

  it('lets ALLOW_SEED_PRODUCTION=1 through, and nothing else', () => {
    const prod = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://postgres:secret@postgres.railway.internal:5432/railway',
    };
    expect(assertSafeSeedTarget('seed', { ...prod, ALLOW_SEED_PRODUCTION: '1' })).toBe(true);
    expect(() =>
      assertSafeSeedTarget('seed', { ...prod, ALLOW_SEED_PRODUCTION: 'true' }),
    ).toThrow();
  });
});
