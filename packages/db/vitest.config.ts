import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Tests live alongside the schema/seed in prisma/. The generated Prisma
    // client (generated/**) is excluded so its bundled files are never scanned.
    include: ['prisma/**/*.spec.ts'],
    exclude: ['node_modules/**', 'generated/**'],
  },
});
