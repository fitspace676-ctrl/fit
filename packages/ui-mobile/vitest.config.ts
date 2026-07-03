import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Only the pure token/palette logic is unit-tested here. Rendering the RN
    // components needs a native runtime — that lives in the app's mobile smoke
    // tests (T9.5), not this package.
    include: ['src/**/*.spec.ts'],
  },
});
