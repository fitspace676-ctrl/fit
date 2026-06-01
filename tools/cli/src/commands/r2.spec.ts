import { describe, expect, it } from 'vitest';
import { infraEnvSchema, validateEnv, type InfraEnv } from '@fit/env';
import { describeConfig } from './r2';

function env(overrides: Record<string, string>): InfraEnv {
  return validateEnv(infraEnvSchema, {
    DATABASE_URL: 'postgresql://localhost:5432/fit',
    ...overrides,
  });
}

describe('describeConfig', () => {
  it('reports configured=true only when all required R2 vars are present', () => {
    const full = describeConfig(
      env({
        R2_ACCOUNT_ID: 'acct',
        R2_ACCESS_KEY_ID: 'akid',
        R2_SECRET_ACCESS_KEY: 'secret',
        R2_BUCKET: 'bucket',
      }),
    );
    expect(full.configured).toBe(true);
    expect(full.endpoint).toBe('https://acct.r2.cloudflarestorage.com');
    expect(full.bucket).toBe('bucket');
  });

  it('reports configured=false when credentials are partial', () => {
    const partial = describeConfig(env({ R2_ACCOUNT_ID: 'acct' }));
    expect(partial.configured).toBe(false);
  });

  it('never includes the access key id or secret in its output', () => {
    const config = describeConfig(
      env({
        R2_ACCOUNT_ID: 'acct',
        R2_ACCESS_KEY_ID: 'super-secret-akid',
        R2_SECRET_ACCESS_KEY: 'super-secret-value',
        R2_BUCKET: 'bucket',
      }),
    );
    const serialized = JSON.stringify(config);
    expect(serialized).not.toContain('super-secret-akid');
    expect(serialized).not.toContain('super-secret-value');
  });
});
