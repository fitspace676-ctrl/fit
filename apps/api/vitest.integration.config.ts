import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration tests (`*.int-spec.ts`) run against REAL Postgres + Redis — the
// CI service containers, or docker-compose locally (`docker compose up -d`).
// Kept separate from the unit config so the default `vitest run` stays fast and
// infra-free; these run only via `pnpm test:integration`.
//
// DATABASE_URL / REDIS_URL are read from the environment (CI / docker-compose)
// with a local-docker-compose fallback, so the same config works in both.
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.int-spec.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/fit_test?schema=public',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      JWT_SECRET: process.env.JWT_SECRET ?? 'integration-test-secret',
    },
    // One shared database across files → run files sequentially so their
    // truncate-and-seed cycles don't race each other.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
