import { defineConfig } from 'vitest/config';

/**
 * The design system's **fast** unit suite.
 *
 * §5 of the rebuild plan draws one hard boundary: Vitest for everything that
 * does not import `react-native`; `jest-expo` + `@testing-library/react-native`
 * (`pnpm test:rn`) only for tests that actually render a component.
 *
 * The token layer is the pure half of this package — palettes, semantic maps,
 * radii, type scale, shadows and the drift assertions are plain data and plain
 * arithmetic. Running them through `jest-expo` costs a full React Native
 * transform to test an object literal, and fails outright: the preset pulls in
 * `@react-native/js-polyfills/error-guard`, which is ESM that Jest will not
 * parse without a `transformIgnorePatterns` escape hatch.
 *
 * So the boundary is enforced by the glob: anything under `src/tokens/**` is
 * renderer-free by construction, and a component spec added there would fail
 * loudly rather than be silently half-run.
 */
export default defineConfig({
  // `src/palette.ts` and `src/palette.mjs` share a basename, and Vite resolves
  // `.mjs` BEFORE `.ts` by default — so `from '../palette'` would silently land
  // on the plain-ESM literals file, which carries the ramps but none of the
  // derived exports, and `RAMP_NAMES` would come back `undefined` rather than
  // failing loudly. The two filenames are fixed by the single-literal-source
  // rule (Tailwind's config loader cannot import `.ts`), so putting `.ts` first
  // here is the cost of that rule. See the hazard note in `src/palette.ts`.
  resolve: { extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'] },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['node_modules/**', 'src/**/*.test.tsx'],
  },
});
