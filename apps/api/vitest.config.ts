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
  },
});
