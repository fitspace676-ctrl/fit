import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Permission, roleHasPermission } from '@fit/types';
import {
  ENDPOINTS,
  endpointPath,
  isPublic,
  requiredPermissions,
  type EndpointSpec,
} from './endpoints';

const METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
const PERMISSIONS = new Set<string>(Object.values(Permission));
/**
 * What a MEMBER may call, resolved the way the SERVER resolves it.
 *
 * `roleHasPermission`, not `ROLE_PERMISSIONS.MEMBER` — the two stopped agreeing
 * when the ACCOUNT capabilities (`profile:manage`, `notification:manage`) moved
 * out of the role matrix: every signed-in user holds them whatever their role,
 * so a roles matrix listing "edit own profile" would be describing the user
 * rather than the job. The raw map therefore reports `GET /me/profile` — which
 * every member has always been able to call — as forbidden. Reading through the
 * same function `PermissionsGuard` uses keeps this test asserting what the API
 * will actually answer.
 */
function memberMayCall(permission: Permission): boolean {
  return roleHasPermission('MEMBER', permission);
}

const entries = Object.entries(ENDPOINTS) as [string, EndpointSpec][];

describe('ENDPOINTS — shape', () => {
  it('declares a method, a path and a permission for every entry', () => {
    for (const [name, endpoint] of entries) {
      expect(METHODS.has(endpoint.method), `${name}: method`).toBe(true);
      expect(endpoint.path.startsWith('/'), `${name}: path is API-relative`).toBe(true);
      // A path that ends in a slash produces `//` against the base URL, which
      // some proxies 301 — and React Native re-issues a 301 as a GET, silently
      // dropping a POST body.
      expect(endpoint.path.endsWith('/'), `${name}: no trailing slash`).toBe(false);
      if (endpoint.permission !== 'public') {
        expect(endpoint.permission.length, `${name}: permission list is non-empty`).toBeGreaterThan(
          0,
        );
        for (const permission of endpoint.permission) {
          expect(PERMISSIONS.has(permission), `${name}: ${permission} is a real Permission`).toBe(
            true,
          );
        }
      }
    }
  });

  it('names every route uniquely, by method + path', () => {
    const seen = entries.map(([, e]) => `${e.method} ${e.path}`);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('is a plain object the manifest checker can import and enumerate', () => {
    // `scripts/build-route-manifest.ts` walks `apps/api`'s controllers and
    // cross-checks this table. A function, a Map, or a lazily-built object would
    // all be opaque to it — so the shape itself is part of the contract.
    expect(typeof ENDPOINTS).toBe('object');
    expect(Array.isArray(ENDPOINTS)).toBe(false);
    expect(entries.length).toBeGreaterThan(0);
    for (const [, endpoint] of entries) {
      expect(Object.keys(endpoint).sort()).toEqual(['method', 'path', 'permission']);
    }
  });
});

describe('ENDPOINTS — every route is one a MEMBER may call', () => {
  it('requires only permissions ROLE_PERMISSIONS.MEMBER grants', () => {
    // This is the defect WP-7 exists to prevent, asserted directly: the deleted
    // app read orders back with `GET /orders/:id`, which requires `BillingRead`
    // — a permission a member does not hold — so the confirmation screen would
    // have 403'd on every purchase. Any entry a member cannot call fails here,
    // independently of the AST-based manifest checker.
    for (const [name, endpoint] of entries) {
      for (const permission of requiredPermissions(endpoint)) {
        expect(memberMayCall(permission), `${name} requires ${permission}`).toBe(true);
      }
    }
  });

  it('excludes the staff-only surfaces by construction', () => {
    const paths = entries.map(([, e]) => e.path);
    for (const path of paths) {
      expect(path.startsWith('/admin/'), `${path} is under /admin`).toBe(false);
      expect(path.startsWith('/orders'), `${path} is under /orders`).toBe(false);
      expect(path.startsWith('/loyalty'), `${path} is under /loyalty`).toBe(false);
      expect(path.startsWith('/invoices'), `${path} is the BillingRead invoice route`).toBe(false);
    }
    // `GET /gyms` is the whole-platform roster (TenantGuard + @AllowCrossTenant).
    expect(paths).not.toContain('/gyms');
    // `/members/*` is the staff roster, with exactly one self-service exception.
    expect(paths.filter((path) => path.startsWith('/members'))).toEqual([
      '/members/me/credit-packs',
    ]);
  });

  it('routes the shop through /cart/checkout and /checkout/:orderId', () => {
    // The two halves of the fix, pinned by name so a regression is a failing
    // test rather than a 404 nobody sees.
    expect(ENDPOINTS.checkoutCart).toEqual({
      method: 'POST',
      path: '/cart/checkout',
      permission: 'public',
    });
    expect(ENDPOINTS.getCheckoutOrder.path).toBe('/checkout/:orderId');
    expect(ENDPOINTS.getCheckoutOrder.method).toBe('GET');
  });
});

describe('ENDPOINTS — the table', () => {
  it('matches the reviewed snapshot', () => {
    // One line per route, so *adding* one is visible in review rather than
    // buried in an object diff. Update deliberately, never with `-u` reflexively.
    const rendered = entries
      .map(([name, endpoint]) => {
        const permission = isPublic(endpoint)
          ? 'public'
          : requiredPermissions(endpoint).join(' + ');
        return `${name}: ${endpoint.method} ${endpoint.path} [${permission}]`;
      })
      .join('\n');
    expect(rendered).toMatchSnapshot();
  });
});

describe('endpointPath', () => {
  it('returns a pattern with no placeholders unchanged', () => {
    expect(endpointPath(ENDPOINTS.getCart)).toBe('/cart');
  });

  it('fills and percent-encodes placeholders', () => {
    expect(endpointPath(ENDPOINTS.getClass, { id: 'ci 1/2' })).toBe('/class-instances/ci%201%2F2');
    expect(endpointPath(ENDPOINTS.removeCartItem, { variantId: 'p_1:0' })).toBe(
      '/cart/items/p_1%3A0',
    );
  });

  it('throws on a missing or blank parameter instead of sending "undefined"', () => {
    // `/class-instances/undefined/bookings` is a real URL: it reaches the server,
    // 404s, and — before D7 — rendered as an empty state.
    expect(() => endpointPath(ENDPOINTS.bookClass, {})).toThrow(/Missing path parameter "id"/);
    expect(() => endpointPath(ENDPOINTS.bookClass, { id: '  ' })).toThrow(/Missing path parameter/);
  });

  it('fills every placeholder in a multi-segment pattern', () => {
    expect(endpointPath(ENDPOINTS.getMyInvoicePdf, { invoiceId: 'inv_1' })).toBe(
      '/me/invoices/inv_1/pdf',
    );
    expect(endpointPath(ENDPOINTS.listTrainerReviews, { id: 't_1' })).toBe('/trainers/t_1/reviews');
  });
});

describe('requiredPermissions / isPublic', () => {
  it('reports a @Public() route as public with no permissions', () => {
    expect(isPublic(ENDPOINTS.listClasses)).toBe(true);
    expect(requiredPermissions(ENDPOINTS.listClasses)).toEqual([]);
  });

  it('reports both permissions of POST /checkout', () => {
    expect(isPublic(ENDPOINTS.createCheckout)).toBe(false);
    expect(requiredPermissions(ENDPOINTS.createCheckout)).toEqual([
      Permission.CreditPackManage,
      Permission.SubscriptionManage,
    ]);
  });
});

describe('the lib/api boundary', () => {
  // WP-3 pins `refresh-gate.ts`'s import list this way; the same technique, for
  // the rule §5 draws: nothing under `lib/` may import `react-native` (Vitest
  // cannot parse its Flow-typed source), and nothing under `lib/api/` may import
  // React at all — that boundary is what makes these fetchers testable with a
  // `fetch` mock and no renderer, and it is the architectural rule that prevents
  // a repeat of zero coverage.
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const modules = readdirSync(dir).filter(
    (file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'),
  );

  const FORBIDDEN = [
    /^react$/,
    /^react\//,
    /^react-dom/,
    /^react-native/,
    /^@react-native/,
    /^@tanstack\/react-query/,
    /^expo/,
    /^nativewind/,
    /^@fit\/ui-mobile/,
  ];

  it('covers every module in the directory', () => {
    // A guard on the guard: if the glob ever silently matches nothing, the rest
    // of this block passes vacuously.
    expect(modules.length).toBeGreaterThanOrEqual(13);
  });

  it.each(modules)('%s imports no React, React Native or Expo module', (file) => {
    const source = readFileSync(`${dir}${file}`, 'utf8');
    const specifiers = [
      ...source.matchAll(/^\s*import[\s\S]*?from\s+'([^']+)';/gm),
      ...source.matchAll(/\bimport\s*\(\s*'([^']+)'\s*\)/g),
    ].map((match) => match[1] as string);

    for (const specifier of specifiers) {
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(specifier), `${file} imports ${specifier}`).toBe(false);
      }
    }
  });

  // `auth.ts` is WP-4's file and predates this table: it deliberately runs its
  // own bare-`fetch` transport (an `/auth/*` call through `apiFetch` would
  // recurse on a 401), and `endpoints.ts` is the table itself.
  const routed = modules.filter((file) => file !== 'auth.ts' && file !== 'endpoints.ts');

  it.each(routed)('%s writes no URL of its own — every path comes from ENDPOINTS', (file) => {
    const source = readFileSync(`${dir}${file}`, 'utf8');
    const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // A hand-built path: a template literal or plain string starting with `/`.
    expect(body, `${file} builds a path by hand`).not.toMatch(/[`'"]\/[a-z-]+[`'"/]/);
    expect(body, `${file} does not route through ENDPOINTS`).toMatch(/\bENDPOINTS\./);
  });
});
