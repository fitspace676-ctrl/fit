import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    // The admin specs cover pure model/logic modules (nav, auth-session) — no
    // DOM, so Node is enough and keeps the run fast.
    environment: 'node',
    include: ['lib/**/*.spec.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
});
