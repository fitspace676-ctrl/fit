import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The marketing site's test runner.
 *
 * `apps/platform` had none — its `test` script was `echo 'nothing to do yet'`,
 * which is how its lead forms could post to a `http://localhost:3000` fallback
 * in production without anything noticing. What is covered here is what breaks
 * quietly: the `/api/leads` forwarder and the lead modals' submit states.
 *
 * Mirrors `apps/web/vitest.config.ts`: Node by default, jsdom for `*.test.tsx`
 * component specs, the same jest-dom + cleanup setup.
 */
export default defineConfig({
  // The app's tsconfig sets `"jsx": "preserve"` — Next's SWC compiler does the
  // JSX transform, not tsc. Vite/esbuild reads that same tsconfig by default,
  // which would leave JSX untouched and break component tests; force the
  // automatic runtime here so esbuild transforms it itself.
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    // Mirrors tsconfig.json's `paths` (`"@/*": ["./*"]`). Vite does not read
    // tsconfig `paths` on its own.
    alias: {
      '@/': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    environmentMatchGlobs: [
      ['**/*.test.tsx', 'jsdom'],
      ['**/*.test.ts', 'jsdom'],
    ],
    setupFiles: ['./vitest.setup.ts'],
    include: ['app/**/*.spec.ts', 'lib/**/*.spec.ts', 'components/**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**'],
  },
});
