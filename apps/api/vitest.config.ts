import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// unplugin-swc transforms NestJS's legacy decorators + emitted metadata so the
// modules under test load correctly under Vitest's esbuild-based pipeline.
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // Minimal env so the validated `config/env` module (imported transitively
    // by units under test) parses successfully without real infrastructure.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/fit_test?schema=public',
      REDIS_URL: 'redis://localhost:6379',
    },
  },
});
