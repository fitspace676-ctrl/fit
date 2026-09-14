import { dirname } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { API_LOG_FILE } from './mail-log';

/**
 * E2E config for a new gym's first day, end to end: a platform operator
 * provisions it, its owner activates and signs in to the console on the gym's own
 * subdomain, a member signs up and verifies there — and none of it is visible
 * from `downtown`. See `tests/new-gym-flow.spec.ts`.
 *
 * It boots all three pieces in their production shape:
 *
 *   - the **API** on :3000, with its output written to {@link API_LOG_FILE} — the
 *     suite reads the onboarding and verification links back out of it (see
 *     `mail-log.ts`);
 *   - the **staff console** on :3002 under its production `/admin` base path;
 *   - the **member site** on :3001, proxying `/admin/*` to that console through
 *     `ADMIN_ORIGIN`, exactly as `fit-web` proxies to `fit-admin` in production.
 *
 * So the browser only ever talks to `<slug>.localhost:3001` — the member site at
 * the root, the console at `/admin` — and the console learns the gym from the
 * `x-forwarded-host` the rewrite sets, as it does behind Vercel.
 *
 * Needs a migrated + seeded database (`pnpm db:migrate && pnpm db:seed`): the seed's
 * `superadmin@fit.local` provisions the gym and `downtown` is the neighbour it must
 * not leak into.
 */

/** Shared signing secret — MUST be identical for the API, the console and the site. */
const JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-test-secret';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';
/** Bare origins for the dev-server health probes (no subdomain needed to boot). */
const WEB_ORIGIN = 'http://localhost:3001';
const ADMIN_ORIGIN = 'http://localhost:3002';
/** Tenants are `<slug>.localhost`; drives gym, CORS and mailed-link resolution. */
const ROOT_DOMAIN = 'localhost';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/fit?schema=public';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  testMatch: /new-gym-flow\.spec\.ts/,
  // One gym's story, told in order: every step stands on the one before it.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['list']] : [['list']],
  // Two dev servers compile each route on its first hit, some of them through the
  // `/admin` proxy — generous, so a cold compile is not mistaken for a failure.
  timeout: 180_000,
  expect: { timeout: 30_000 },

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    navigationTimeout: 90_000,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      // Never reused: the suite reads mail out of THIS process's output, and a
      // server someone else started writes it somewhere else.
      command: `mkdir -p "${dirname(API_LOG_FILE)}" && pnpm --filter @fit/api start > "${API_LOG_FILE}" 2>&1`,
      url: `${API_URL}/health`,
      reuseExistingServer: false,
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
        // Every request comes from one host; per-IP limits would only throttle it.
        RATE_LIMIT_ENABLED: 'false',
        // `<slug>.localhost:3001` is allowed by the root-domain suffix rule.
        CORS_ORIGINS: `${WEB_ORIGIN},${ADMIN_ORIGIN}`,
        PLATFORM_ROOT_DOMAIN: ROOT_DOMAIN,
        // Plain text in the log the suite parses.
        NO_COLOR: '1',
      },
    },
    {
      command: 'pnpm --filter @fit/admin dev',
      url: `${ADMIN_ORIGIN}/admin/403`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      cwd: '../..',
      env: {
        JWT_SECRET,
        NEXT_PUBLIC_API_URL: API_URL,
        // The production base path, so it lines up behind the member site's proxy.
        ADMIN_BASE_PATH: '/admin',
        NEXT_PUBLIC_ROOT_DOMAIN: ROOT_DOMAIN,
      },
    },
    {
      command: 'pnpm --filter @fit/web dev',
      url: `${WEB_ORIGIN}/en/member/login`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      cwd: '../..',
      env: {
        JWT_SECRET,
        NEXT_PUBLIC_API_URL: API_URL,
        NEXT_PUBLIC_ROOT_DOMAIN: ROOT_DOMAIN,
        // `<slug>.localhost:3001/admin/*` → the console above.
        ADMIN_ORIGIN,
      },
    },
  ],
});
