import { describe, expect, it } from 'vitest';
import { envFilesFor, isEnvTarget, parseDotenv } from './env-source';

describe('parseDotenv', () => {
  it('parses KEY=value lines, ignoring comments and blanks', () => {
    const parsed = parseDotenv(
      ['# comment', '', 'FOO=bar', 'EMPTY=', 'WITH_SPACES = spaced ', 'no_equals'].join('\n'),
    );
    expect(parsed).toEqual({ FOO: 'bar', EMPTY: '', WITH_SPACES: 'spaced' });
  });

  it('strips surrounding single and double quotes', () => {
    const parsed = parseDotenv(['A="quoted"', "B='single'", 'C=plain'].join('\n'));
    expect(parsed).toEqual({ A: 'quoted', B: 'single', C: 'plain' });
  });

  it('keeps = inside values (e.g. connection query strings)', () => {
    const parsed = parseDotenv('DATABASE_URL=postgres://h/db?schema=public');
    expect(parsed.DATABASE_URL).toBe('postgres://h/db?schema=public');
  });
});

describe('isEnvTarget', () => {
  it('accepts known targets only', () => {
    expect(isEnvTarget('local')).toBe(true);
    expect(isEnvTarget('preview')).toBe(true);
    expect(isEnvTarget('prod')).toBe(true);
    expect(isEnvTarget('staging')).toBe(false);
  });
});

describe('envFilesFor', () => {
  it('targets the matching .env files per environment', () => {
    expect(envFilesFor('local')).toEqual(['.env', '.env.local']);
    expect(envFilesFor('preview')).toEqual(['.env', '.env.preview']);
    expect(envFilesFor('prod')).toEqual(['.env', '.env.production']);
  });
});
