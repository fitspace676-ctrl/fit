import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@stylexjs/stylex': fileURLToPath(new URL('./test/stylex-mock.ts', import.meta.url)),
    },
  },
  test: {
    globals: false,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.spec.tsx'],
  },
});
