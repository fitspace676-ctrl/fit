import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { buildConsoleUrl } from './console-url';

// `ADMIN_BASE_PATH` and `PLATFORM_ROOT_DOMAIN` both carry the schema's default in
// the real `env` (they are `.default()`, not `.optional()`), so the base config
// here gives them a string too — a spec that left them undefined would be
// testing a state that only a misconfigured build can reach.
function configure(overrides: Record<string, unknown> = {}): void {
  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  Object.assign(
    mockEnv,
    { ADMIN_BASE_PATH: '/admin', PLATFORM_ROOT_DOMAIN: 'formacore.io' },
    overrides,
  );
}

describe('buildConsoleUrl', () => {
  afterEach(() => configure());

  it("addresses the gym's own tenant host when a slug is in scope", () => {
    configure({ ADMIN_URL: 'https://app.formacore.io' });
    expect(buildConsoleUrl('reports', 'downtown')).toBe(
      'https://downtown.formacore.io/admin/reports',
    );
  });

  it('gives two gyms two different hosts', () => {
    configure();
    expect(buildConsoleUrl('dashboard', 'downtown')).toBe(
      'https://downtown.formacore.io/admin/dashboard',
    );
    expect(buildConsoleUrl('dashboard', 'uptown')).toBe(
      'https://uptown.formacore.io/admin/dashboard',
    );
  });

  it('falls back to ADMIN_URL when there is no slug in scope', () => {
    configure({ ADMIN_URL: 'https://app.formacore.io/' });
    expect(buildConsoleUrl('reports')).toBe('https://app.formacore.io/admin/reports');
    expect(buildConsoleUrl('reports', null)).toBe('https://app.formacore.io/admin/reports');
  });

  it('falls back to ADMIN_URL when no root domain is configured', () => {
    configure({ ADMIN_URL: 'https://app.formacore.io', PLATFORM_ROOT_DOMAIN: undefined });
    expect(buildConsoleUrl('products', 'downtown')).toBe('https://app.formacore.io/admin/products');

    configure({ ADMIN_URL: 'https://app.formacore.io', PLATFORM_ROOT_DOMAIN: '' });
    expect(buildConsoleUrl('products', 'downtown')).toBe('https://app.formacore.io/admin/products');
  });

  it('uses http for a localhost dev root, keeping its port', () => {
    configure({ PLATFORM_ROOT_DOMAIN: 'localhost:3001', ADMIN_URL: 'http://localhost:3002' });
    expect(buildConsoleUrl('reports', 'downtown')).toBe(
      'http://downtown.localhost:3001/admin/reports',
    );
  });

  it('adds no prefix for a console genuinely served at the root', () => {
    configure({ ADMIN_BASE_PATH: '', ADMIN_URL: 'https://app.formacore.io' });
    expect(buildConsoleUrl('reports', 'downtown')).toBe('https://downtown.formacore.io/reports');
    expect(buildConsoleUrl('reports')).toBe('https://app.formacore.io/reports');
  });

  it('returns undefined with neither a tenant host nor ADMIN_URL', () => {
    configure({ PLATFORM_ROOT_DOMAIN: '' });
    expect(buildConsoleUrl('reports', 'downtown')).toBeUndefined();
    expect(buildConsoleUrl('reports')).toBeUndefined();
  });
});
