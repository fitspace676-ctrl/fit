import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    // The admin specs cover pure model/logic modules (nav, auth-session) — no
    // DOM, so Node is enough and keeps the run fast.
    environment: 'node',
    // `app/**/*.spec.ts` is included for co-located server-side specs (e.g. route
    // handlers, server actions) — this config is node-only, so a DOM/component
    // spec under `app/` would need its own `environment: 'jsdom'` override.
    include: ['lib/**/*.spec.ts', 'app/**/*.spec.ts', 'hooks/**/*.spec.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
});
