import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The member portal's test runner.
 *
 * `apps/web` had none: its `test` script was `echo 'nothing to do yet'` while
 * `apps/admin` ran 22 spec files. That was tolerable while the portal was
 * presentation over server-fetched data, and stopped being tolerable when the
 * timezone bug landed — the dashboard printed class times in UTC while every
 * other screen printed them on the gym's clock, for months, with nothing to
 * catch it.
 *
 * Scope is deliberately narrow: DOM-free, pure logic. That is where this app's
 * real bugs live (zone arithmetic, day boundaries, filter predicates), and it
 * needs neither jsdom nor the StyleX shim the admin config carries. Component
 * tests can be added later by mirroring `apps/admin/vitest.config.ts`, which
 * already solves both.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Mirrors tsconfig.json's `paths` (`"@/*": ["./*"]`). Vite does not read
      // tsconfig `paths` on its own, so without this any spec whose module
      // imports `@/lib/...` fails to resolve under Vitest even though it builds
      // and type-checks fine.
      '@/': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'lib/**/*.spec.ts', 'app/**/*.spec.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
});
