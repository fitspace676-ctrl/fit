import { describe, expect, it } from 'vitest';
import { normaliseApiUrl, REQUEST_TIMEOUT_MS, env } from './env';

describe('normaliseApiUrl', () => {
  it('strips every trailing slash so a joined path can never double up', () => {
    expect(normaliseApiUrl('https://api.fit.ge/')).toBe('https://api.fit.ge');
    expect(normaliseApiUrl('https://api.fit.ge///')).toBe('https://api.fit.ge');
    expect(normaliseApiUrl('https://api.fit.ge')).toBe('https://api.fit.ge');
  });

  it('preserves a path prefix, minus its trailing slash', () => {
    expect(normaliseApiUrl('https://fit.ge/api/')).toBe('https://fit.ge/api');
  });

  it('falls back to the local API when unset, empty, or whitespace', () => {
    expect(normaliseApiUrl(undefined)).toBe('http://localhost:3000');
    expect(normaliseApiUrl('')).toBe('http://localhost:3000');
    expect(normaliseApiUrl('   ')).toBe('http://localhost:3000');
    expect(normaliseApiUrl(null)).toBe('http://localhost:3000');
  });

  it('trims surrounding whitespace from a pasted value', () => {
    expect(normaliseApiUrl('  http://192.168.1.20:3000  ')).toBe('http://192.168.1.20:3000');
  });
});

describe('env', () => {
  it('exposes a per-attempt timeout, since no timeout was defect #4', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(15_000);
    expect(env.requestTimeoutMs).toBe(REQUEST_TIMEOUT_MS);
  });

  it('resolves apiUrl with no trailing slash', () => {
    expect(env.apiUrl).not.toMatch(/\/$/);
  });
});
