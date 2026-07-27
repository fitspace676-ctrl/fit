// @fit/admin — basePath-aware URL building for raw <a href> / fetch targets.
//
// `NEXT_PUBLIC_ADMIN_BASE_PATH` is inlined at build time, so the module reads it once
// at import. Each case therefore sets the variable and re-imports with a reset module
// registry rather than mutating a live binding.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH;

/** Import `adminPath` with the basePath env var set to `value` (or unset). */
async function loadWithBasePath(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_ADMIN_BASE_PATH;
  } else {
    process.env.NEXT_PUBLIC_ADMIN_BASE_PATH = value;
  }
  const mod = await import('./base-path');
  return mod.adminPath;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_ADMIN_BASE_PATH;
  else process.env.NEXT_PUBLIC_ADMIN_BASE_PATH = ORIGINAL;
});

describe('adminPath', () => {
  it('prefixes a root-relative route-handler URL with the basePath', async () => {
    const adminPath = await loadWithBasePath('/admin');
    // The bug this exists to prevent: a bare href 404s because it misses `/admin`.
    expect(adminPath('/payments/invoices/abc123/pdf')).toBe('/admin/payments/invoices/abc123/pdf');
  });

  it('keeps the query string intact', async () => {
    const adminPath = await loadWithBasePath('/admin');
    expect(adminPath('/reports/export?report=revenue&format=csv')).toBe(
      '/admin/reports/export?report=revenue&format=csv',
    );
  });

  it('is a no-op when the console is served from the origin root', async () => {
    const adminPath = await loadWithBasePath('');
    expect(adminPath('/payments/invoices/abc123/pdf')).toBe('/payments/invoices/abc123/pdf');
  });

  it('treats an unset basePath as the origin root', async () => {
    const adminPath = await loadWithBasePath(undefined);
    expect(adminPath('/payments/invoices/abc123/pdf')).toBe('/payments/invoices/abc123/pdf');
  });

  it('leaves a relative URL alone — it already resolves under the basePath', async () => {
    const adminPath = await loadWithBasePath('/admin');
    expect(adminPath('pdf')).toBe('pdf');
  });

  it('honours a non-default basePath', async () => {
    const adminPath = await loadWithBasePath('/console');
    expect(adminPath('/payments/invoices/abc123/pdf')).toBe(
      '/console/payments/invoices/abc123/pdf',
    );
  });
});
