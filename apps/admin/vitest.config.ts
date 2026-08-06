import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The app's tsconfig sets `"jsx": "preserve"` — Next's own SWC compiler does
  // the JSX transform, not tsc. Vite/esbuild reads that same tsconfig by
  // default, which would leave JSX untouched and break `.test.tsx` component
  // tests; force the automatic runtime here so esbuild transforms it itself.
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      // Component tests never run the StyleX SWC build (Next-only), so
      // `stylex.create()` throws unless it's swapped for a pass-through shim.
      // See `test/stylex-mock.ts` for the full rationale.
      '@stylexjs/stylex': fileURLToPath(new URL('./test/stylex-mock.ts', import.meta.url)),
    },
  },
  test: {
    globals: false,
    // The admin specs cover pure model/logic modules (nav, auth-session) — no
    // DOM, so Node is enough and keeps the run fast. Component/behaviour tests
    // (`*.test.tsx`, e.g. the segment tab bar) opt into jsdom automatically via
    // `environmentMatchGlobs` below, mirroring @fit/ui-web's per-file pattern
    // without needing a docblock in each test file.
    environment: 'node',
    environmentMatchGlobs: [['app/**/*.test.tsx', 'jsdom']],
    setupFiles: ['./vitest.setup.ts'],
    // `app/**/*.spec.ts` is included for co-located server-side specs (e.g. route
    // handlers, server actions); `app/**/*.test.tsx` for co-located component
    // tests (e.g. the segment tab bar) — the latter run under jsdom, see above.
    include: [
      'lib/**/*.spec.ts',
      'app/**/*.spec.ts',
      'app/**/*.test.tsx',
      'hooks/**/*.spec.ts',
      // The POS cart store is pure money arithmetic (percentage discounts, totals,
      // change due) — exactly the logic worth pinning down, and DOM-free.
      'stores/**/*.spec.ts',
    ],
    exclude: ['node_modules/**', '.next/**'],
  },
});
