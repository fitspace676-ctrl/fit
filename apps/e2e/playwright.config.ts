import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for the staff **admin** console (`@fit/admin`, port 3002) backed by
 * the NestJS **API** (`@fit/api`, port 3000) and a real Postgres + Redis.
 *
 * The admin app has no login UI of its own — auth is an `accessToken` cookie
 * (an HS256 JWT the API mints, verified by the admin middleware against the
 * shared `JWT_SECRET`). `global-setup.ts` logs the seeded OWNER in against the
 * API once and persists that cookie as `storageState`, so every test starts
 * already authenticated. The whole suite therefore depends on:
 *
 *   1. the same `JWT_SECRET` reaching both the API and the admin app (below), and
 *   2. the database being migrated + seeded (`pnpm db:migrate && pnpm db:seed`).
 *
 * `ADMIN_BASE_PATH=''` serves the console at the root (its production default is
 * `/admin`), so tests can target bare paths like `/members`.
 */

/** Shared signing secret — MUST be identical for the API and the admin app. */
const JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-test-secret';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';
const ADMIN_URL = process.env.E2E_ADMIN_URL ?? 'http://localhost:3002';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/fit?schema=public';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  // The member portal suite is a separate config (`playwright.web.config.ts`) with
  // its own base URL + servers; keep it out of this admin run.
  testIgnore: /member-.*\.spec\.ts/,
  globalSetup: './global-setup.ts',
  // Flows are interdependent (create member → check that member in; sale → refund
  // that order), so a file's tests run in order and stop on the first failure.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: ADMIN_URL,
    storageState: '.auth/storage-state.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // The seeded strings are English; the admin UI defaults to Georgian and
    // reads the locale from a cookie (set alongside the auth cookie in setup).
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
        CORS_ORIGINS: `${ADMIN_URL},http://localhost:3001`,
      },
    },
    {
      command: 'pnpm --filter @fit/admin dev',
      url: `${ADMIN_URL}/403`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      cwd: '../..',
      env: {
        JWT_SECRET,
        NEXT_PUBLIC_API_URL: API_URL,
        // Serve at the root instead of the production `/admin` base path.
        ADMIN_BASE_PATH: '',
        NEXT_PUBLIC_ROOT_DOMAIN: 'localhost',
      },
    },
  ],
});
