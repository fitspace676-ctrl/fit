import { describe, expect, it } from 'vitest';
import { isOriginAllowed } from './allowed-origin';

const ALLOW = ['https://fit.ge', 'http://localhost:3001'];

describe('isOriginAllowed', () => {
  it('allows a missing Origin (same-origin / non-browser)', () => {
    expect(isOriginAllowed(undefined, ALLOW, 'fit.ge')).toBe(true);
  });

  it('allows an exact allow-list match', () => {
    expect(isOriginAllowed('http://localhost:3001', ALLOW, 'fit.ge')).toBe(true);
  });

  it('allows the apex and any tenant subdomain of the root domain', () => {
    expect(isOriginAllowed('https://fit.ge', ALLOW, 'fit.ge')).toBe(true);
    expect(isOriginAllowed('https://downtown.fit.ge', ALLOW, 'fit.ge')).toBe(true);
    expect(isOriginAllowed('https://riverside.fit.ge', ALLOW, 'fit.ge')).toBe(true);
  });

  it('allows dev localhost subdomains when the root is localhost', () => {
    expect(isOriginAllowed('http://downtown.localhost:3001', [], 'localhost')).toBe(true);
    expect(isOriginAllowed('http://localhost:3001', [], 'localhost:3001')).toBe(true);
  });

  it('rejects a foreign origin not under the root domain', () => {
    expect(isOriginAllowed('https://evil.com', ALLOW, 'fit.ge')).toBe(false);
    expect(isOriginAllowed('https://notfit.ge', ALLOW, 'fit.ge')).toBe(false);
    expect(isOriginAllowed('https://fit.ge.evil.com', ALLOW, 'fit.ge')).toBe(false);
  });

  it('rejects an unparseable origin not in the list', () => {
    expect(isOriginAllowed('not-a-url', ALLOW, 'fit.ge')).toBe(false);
  });

  it('rejects everything but the explicit list when no root domain is set', () => {
    expect(isOriginAllowed('https://downtown.fit.ge', ALLOW, undefined)).toBe(false);
    expect(isOriginAllowed('https://fit.ge', ALLOW, undefined)).toBe(true);
  });
});
