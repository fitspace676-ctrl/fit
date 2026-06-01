import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EnvValidationError, validateEnv } from './validate';

const schema = z.object({
  API_KEY: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
});

describe('validateEnv', () => {
  it('returns typed, coerced values for a valid source', () => {
    const env = validateEnv(schema, { API_KEY: 'secret', PORT: '8080' });

    expect(env).toEqual({ API_KEY: 'secret', PORT: 8080, NODE_ENV: 'development' });
  });

  it('applies defaults for absent optional keys', () => {
    const env = validateEnv(schema, { API_KEY: 'secret' });

    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('throws EnvValidationError listing every offending variable', () => {
    expect(() => validateEnv(schema, { PORT: 'not-a-number' })).toThrow(EnvValidationError);

    try {
      validateEnv(schema, { PORT: 'not-a-number' });
      expect.unreachable('validateEnv should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const { issues, message } = error as EnvValidationError;
      expect(issues.some((issue) => issue.startsWith('API_KEY'))).toBe(true);
      expect(issues.some((issue) => issue.startsWith('PORT'))).toBe(true);
      expect(message).toContain('Invalid environment variables');
    }
  });

  it('defaults the source to process.env', () => {
    const env = validateEnv(z.object({ DEFINITELY_UNSET_VAR: z.string().optional() }));

    expect(env.DEFINITELY_UNSET_VAR).toBeUndefined();
  });
});
