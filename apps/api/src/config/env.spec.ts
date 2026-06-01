import { describe, expect, it } from 'vitest';
import { EnvValidationError, validateEnv } from '@fit/env';
import { envSchema } from './env';

/** A complete, valid environment to clone and mutate per test. */
const validEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/fit?schema=public',
} as const;

describe('apiEnvSchema', () => {
  it('applies defaults for optional infrastructure values', () => {
    const env = validateEnv(envSchema, { ...validEnv });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.SENTRY_TRACES_SAMPLE_RATE).toBe(0.1);
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('coerces PORT and the Sentry sample rate to numbers', () => {
    const env = validateEnv(envSchema, {
      ...validEnv,
      PORT: '8080',
      SENTRY_TRACES_SAMPLE_RATE: '0.5',
    });

    expect(env.PORT).toBe(8080);
    expect(env.SENTRY_TRACES_SAMPLE_RATE).toBe(0.5);
  });

  it('rejects a missing DATABASE_URL secret', () => {
    expect(() => validateEnv(envSchema, {})).toThrow(EnvValidationError);

    try {
      validateEnv(envSchema, {});
      expect.unreachable('validateEnv should have thrown');
    } catch (error) {
      expect((error as EnvValidationError).issues.some((i) => i.startsWith('DATABASE_URL'))).toBe(
        true,
      );
    }
  });

  it('rejects a malformed DATABASE_URL', () => {
    expect(() => validateEnv(envSchema, { DATABASE_URL: 'not-a-url' })).toThrow(EnvValidationError);
  });

  it('rejects an out-of-range Sentry sample rate', () => {
    expect(() => validateEnv(envSchema, { ...validEnv, SENTRY_TRACES_SAMPLE_RATE: '2' })).toThrow(
      EnvValidationError,
    );
  });
});
