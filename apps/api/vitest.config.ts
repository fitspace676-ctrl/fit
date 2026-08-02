import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// unplugin-swc transforms NestJS's legacy decorators + emitted metadata so the
// modules under test load correctly under Vitest's esbuild-based pipeline.
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // Minimal env so the validated `config/env` module (imported transitively
    // by units under test) parses successfully without real infrastructure.
    // `TZ` is pinned because several specs assert on gym-local time derived
    // from a configured timezone (see staff-depth.service.spec.ts): if the
    // host's own zone leaks in, a run on a machine whose zone happens to
    // match the fixture gym's can pass even when the derivation regresses
    // back to reading the server's local clock. Pinning UTC makes local runs
    // agree with CI and keeps that regression detectable on any machine.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/fit_test?schema=public',
      REDIS_URL: 'redis://localhost:6379',
      TZ: 'UTC',
    },
    // Coverage is the honest floor under the API's business logic (T9.10). The
    // gate fails the `test:cov` run — and the CI job that calls it — if any
    // metric drops below 70%, so a new billing/notification service that lands
    // without specs can't quietly erode the number.
    coverage: {
      provider: 'v8',
      // Measure the source, not the specs that exercise it.
      include: ['src/**/*.ts'],
      // Excluded from the denominator because they carry no branchable logic to
      // spec: DI wiring (`*.module.ts`), the process bootstraps (`main.ts`,
      // `instrument.ts`, `config/openapi.ts`), integration-only test helpers, and
      // the spec files themselves. Everything with real behaviour (services,
      // controllers, guards, middleware, pure helpers) stays counted.
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.int-spec.ts',
        'src/**/*.module.ts',
        'src/main.ts',
        'src/instrument.ts',
        'src/config/openapi.ts',
        'src/test/**',
      ],
      reporter: ['text-summary', 'json-summary'],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 70,
      },
    },
  },
});
