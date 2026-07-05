import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    // Pure class-composition / data-logic specs (`*.spec.ts`) run in Node.
    // Interaction/behaviour tests (`*.test.tsx`, T9.6) opt into jsdom per file
    // with a `// @vitest-environment jsdom` docblock so they can render the kits.
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.spec.ts', 'src/**/*.test.tsx'],
  },
});
