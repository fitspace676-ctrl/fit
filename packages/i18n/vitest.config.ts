import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['**/*.spec.ts'],
    exclude: ['node_modules/**'],
  },
});
