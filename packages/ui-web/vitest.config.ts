import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Only the pure class-composition / data logic is unit-tested here (no DOM
    // render). Interaction behaviour of the kits is covered by T9.6.
    include: ['src/**/*.spec.ts'],
  },
});
