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
 * Most of it is DOM-free, pure logic — that is where this app's real bugs live
 * (zone arithmetic, day boundaries, filter predicates). Component tests
 * (`*.test.tsx`) opt into jsdom automatically via `environmentMatchGlobs`
 * below, mirroring `apps/admin/vitest.config.ts`: the same StyleX shim (the
 * compiler never runs under Vitest) and the same jest-dom + cleanup setup.
 */
export default defineConfig({
  // The app's tsconfig sets `"jsx": "preserve"` — Next's SWC compiler does the
  // JSX transform, not tsc. Vite/esbuild reads that same tsconfig by default,
  // which would leave JSX untouched and break `.test.tsx` component tests;
  // force the automatic runtime here so esbuild transforms it itself.
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      // Component tests never run the StyleX SWC build (Next-only), so
      // `stylex.create()` throws unless it's swapped for a pass-through shim.
      // See `test/stylex-mock.ts` for the full rationale.
      '@stylexjs/stylex': fileURLToPath(new URL('./test/stylex-mock.ts', import.meta.url)),
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
    environmentMatchGlobs: [['src/**/*.test.tsx', 'jsdom']],
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.spec.ts', 'lib/**/*.spec.ts', 'app/**/*.spec.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**'],
  },
});
