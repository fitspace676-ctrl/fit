import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for the member **web** portal (`@fit/web`, port 3001) backed by the
 * NestJS **API** (`@fit/api`, port 3000) and a real Postgres + Redis. Companion to
 * the admin `playwright.config.ts`; the two suites are separate configs so each
 * boots only the apps it drives and carries its own base URL.
 *
 * The portal is **tenant-scoped by subdomain**: the active gym is resolved from
 * the request `Host` against `NEXT_PUBLIC_ROOT_DOMAIN`, so it must be driven on a
 * gym host, not bare `localhost`. We point the browser at
 * `http://downtown.localhost:3001` (Chromium resolves `*.localhost` to loopback)
 * with `NEXT_PUBLIC_ROOT_DOMAIN=localhost`, so `getActiveGymId()` resolves the
 * seeded `downtown` gym and the classes/shop render its data. The suite depends on:
 *
 *   1. the same `JWT_SECRET` reaching the API and the web app (the web middleware
 *      verifies the session cookie the API signed), and
 *   2. a migrated + seeded database (`pnpm db:migrate && pnpm db:seed`).
 *
 * The web server runs in **dev** mode on purpose: the session cookies the sign-in
 * plants are only marked `secure` in production, which would drop them over plain
 * HTTP — dev keeps them readable so the authenticated steps work.
 */

/** Shared signing secret — MUST be identical for the API and the web app. */
const JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-test-secret';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';
/** The tenant host the portal is driven on (the `downtown` gym's subdomain). */
const WEB_HOST = process.env.E2E_WEB_HOST ?? 'downtown.localhost:3001';
const WEB_URL = `http://${WEB_HOST}`;
/** Bare origin for the dev-server health probe (no subdomain needed to boot). */
const WEB_ORIGIN = process.env.E2E_WEB_ORIGIN ?? 'http://localhost:3001';
/** The platform root the subdomain is a tenant of; drives gym + CORS resolution. */
const ROOT_DOMAIN = 'localhost';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/fit?schema=public';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  // Only the member suite — the admin suite is the sibling config.
  testMatch: /member-booking-checkout\.spec\.ts/,
  // Steps are interdependent (register → sign in → book → shop), so they run in
  // order and stop on the first failure.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Drive the English UI so the button-label selectors match; the portal
    // defaults to Georgian and switches on the `/en` path prefix.
    locale: 'en-US',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'pnpm --filter @fit/api start',
      url: `${API_URL}/health`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      cwd: '../..',
      env: {
        NODE_ENV: 'test',
        PORT: '3000',
        DATABASE_URL,
        REDIS_URL,
        JWT_SECRET,
        // Long-lived access token so a full suite run never outlives its session.
        JWT_ACCESS_TTL: '3600',
        // The whole suite hits the API from one host, so per-IP rate limiting
        // (T9.7) would throttle it spuriously — and it protects nothing here.
        RATE_LIMIT_ENABLED: 'false',
        // The browser calls the API cross-origin from the tenant host; allow it
        // both by exact origin and via the `*.localhost` root-domain suffix rule.
        CORS_ORIGINS: `${WEB_URL},${WEB_ORIGIN}`,
        PLATFORM_ROOT_DOMAIN: ROOT_DOMAIN,
      },
    },
    {
      command: 'pnpm --filter @fit/web dev',
      // Probe a public page on the bare origin — the server serves every host.
      url: `${WEB_ORIGIN}/en/member/login`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      cwd: '../..',
      env: {
        JWT_SECRET,
        NEXT_PUBLIC_API_URL: API_URL,
        // Makes the portal resolve `downtown.localhost` to the `downtown` tenant.
        NEXT_PUBLIC_ROOT_DOMAIN: ROOT_DOMAIN,
      },
    },
  ],
});
