// Render tests for the mobile design system.
//
// `jest-expo` is the only supported test path for NativeWind — it applies the
// same Babel transform (`jsxImportSource: 'nativewind'`) the Metro build does,
// so `className` resolves to real styles under test instead of being dropped.
// Everything in this repo that does NOT import `react-native` is tested with
// Vitest instead; that boundary is deliberate (see docs/mobile-rebuild-plan.md §5).
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // `.ts` BEFORE `.mjs`. The same resolution hazard `vitest.config.ts` and the
  // header of `src/palette.ts` describe, in a third tool.
  //
  // `src/palette.ts` and `src/palette.mjs` share a basename — forced by the
  // single-literal-source rule, since Tailwind's config loader cannot import
  // `.ts` — so `from '../palette'` is ambiguous and every tool breaks the tie
  // by its own extension order. Jest's DEFAULT order is
  // `['js','mjs','cjs','jsx','ts','tsx','json','node']`, and `jest-expo@56`'s
  // preset does not override it, so `.mjs` wins: `semantic.ts` resolves to the
  // plain-ESM literals file, which Jest then cannot parse ("Unexpected token
  // 'export'"), and every render test that touches a colour dies. Note this
  // contradicts the table in `src/palette.ts`, which lists jest-expo as
  // resolving `.ts` first; it does not.
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'node'],
  // `.test.tsx` ONLY — the other half of the boundary.
  //
  // The original glob was `*.{spec,test}.{ts,tsx}`, which swept up the Vitest
  // suite (`src/**/*.spec.ts`) as well. Those files `import { describe, it,
  // expect } from 'vitest'`, so jest either failed on them or, worse, would
  // have run a half-mocked copy. One extension per runner: `*.spec.ts` is
  // Vitest and renderer-free; `*.test.tsx` is jest-expo and renders.
  testMatch: ['<rootDir>/src/**/*.test.tsx'],
  // The monorepo ships these as untranspiled ESM/Flow source.
  //
  // THE `.pnpm/` HOP. This is an ALLOWLIST expressed as a negative lookahead,
  // and pnpm's store defeats the naive form: every real path here is
  // `…/node_modules/.pnpm/<pkg>@<version>[_peers]/node_modules/<pkg>/…`, so the
  // regex also gets a shot at matching from the FIRST `node_modules/`, where
  // what follows is `.pnpm/` — which is on nobody's allowlist, so the lookahead
  // succeeds, the path matches, and the package is excluded from transformation.
  // Any single match means "do not transform", so the second, correct position
  // never gets a say. Without the optional `.pnpm/<dir>/node_modules/` hop
  // below, `jest-expo`'s own setup file is left untransformed and EVERY render
  // test in this package dies on `import '@react-native/js-polyfills/error-guard'`
  // with "Cannot use import statement outside a module" — before a single line
  // of component code is reached.
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-css-interop|nativewind))',
  ],
  // Transform `.mjs` too.
  //
  // `jest-expo` registers exactly one JS transform, keyed `\.[jt]sx?$`, so a
  // `.mjs` file is handed to the runtime untransformed and its `export const`
  // throws "Unexpected token 'export'". Ordinarily that is fine — nothing in a
  // React Native package is `.mjs`. Here `src/palette.mjs` is, and it is not
  // negotiable: it is the SINGLE literal source for the palette, and it has to
  // be plain ESM because Tailwind's config loader (which reads it through
  // `tailwind.preset.mjs`) cannot import `.ts`. `src/palette.ts` imports it by
  // its explicit `./palette.mjs` specifier, so the extension order above does
  // not save us — the file itself must be transformable.
  //
  // The preset has to be named explicitly: `jest-expo` invokes `babel-jest`
  // with `presets: [expo/internal/babel-preset]` passed as transformer OPTIONS
  // rather than through a `babel.config.js`, so a bare `'babel-jest'` here
  // would run with no presets at all and change nothing.
  transform: {
    '^.+\\.mjs$': [
      'babel-jest',
      {
        presets: [require.resolve('expo/internal/babel-preset')],
        babelrc: false,
        configFile: false,
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.{spec,test}.{ts,tsx}'],
};
