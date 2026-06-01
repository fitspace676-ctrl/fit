import { describe, expect, it } from 'vitest';
import { validateEnv } from './validate';
import { infraEnvSchema, isSecretInfraKey } from './infra';

describe('infraEnvSchema', () => {
  it('validates and coerces a minimal valid infra environment', () => {
    const env = validateEnv(infraEnvSchema, {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/fit',
    });

    expect(env.DATABASE_URL).toBe('postgresql://postgres:postgres@localhost:5432/fit');
    // Defaults applied.
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.API_URL).toBe('http://localhost:3000');
    expect(env.NODE_ENV).toBe('development');
    expect(env.R2_SIGNED_URL_TTL).toBe(900);
  });

  it('coerces the R2 TTL and rejects values over the one-week SigV4 maximum', () => {
    const env = validateEnv(infraEnvSchema, {
      DATABASE_URL: 'postgresql://localhost:5432/fit',
      R2_SIGNED_URL_TTL: '3600',
    });
    expect(env.R2_SIGNED_URL_TTL).toBe(3600);

    expect(() =>
      validateEnv(infraEnvSchema, {
        DATABASE_URL: 'postgresql://localhost:5432/fit',
        R2_SIGNED_URL_TTL: '999999',
      }),
    ).toThrow();
  });

  it('fails when the required DATABASE_URL is absent', () => {
    expect(() => validateEnv(infraEnvSchema, {})).toThrow();
  });
});

describe('isSecretInfraKey', () => {
  it('flags secret-bearing keys', () => {
    expect(isSecretInfraKey('DATABASE_URL')).toBe(true);
    expect(isSecretInfraKey('JWT_SECRET')).toBe(true);
    expect(isSecretInfraKey('R2_SECRET_ACCESS_KEY')).toBe(true);
  });

  it('treats non-secret config keys as safe to print', () => {
    expect(isSecretInfraKey('R2_BUCKET')).toBe(false);
    expect(isSecretInfraKey('API_URL')).toBe(false);
    expect(isSecretInfraKey('NODE_ENV')).toBe(false);
  });
});
