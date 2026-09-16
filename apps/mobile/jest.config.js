// Render tests for the mobile app's screens.
//
// §5 of the rebuild plan draws ONE HARD BOUNDARY and this file is the far side
// of it. `pnpm test` is Vitest over `lib/**` and `hooks/**` — renderer-free
// modules, fast, `environment: 'node'`. `pnpm test:rn` is this: jest-expo over
// anything that mounts a component. The two never overlap, because Vitest
// cannot parse React Native's Flow-typed source and jest-expo cannot run a file
// that imports `vitest`.
//
// The extension split is the enforcement: `*.spec.ts` is Vitest's, `*.test.tsx`
// is this runner's. `vitest.config.ts` includes only `lib|hooks/**/*.spec.ts`;
// `testMatch` below claims only `*.test.tsx`. A file with the wrong extension
// is simply not run by either, which is loud enough in review.
//
// Modelled on `packages/ui-mobile/jest.config.js`. Its header documents two
// non-obvious things that are just as true here, because this app imports that
// package — the `.pnpm/` hop in `transformIgnorePatterns` and the `.mjs`
// transform. Both are reproduced below with the reasoning, not just the value,
// since a copied regex with no explanation is a regex the next person deletes.
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // `.ts` BEFORE `.mjs`. `@fit/ui-mobile` ships `src/palette.ts` AND
  // `src/palette.mjs` under one basename — forced by its single-literal-source
  // rule, because Tailwind's config loader cannot import `.ts` — so
  // `from '../palette'` is ambiguous and every tool breaks the tie by its own
  // extension order. Jest's default is `['js','mjs',…,'ts','tsx',…]`, so
  // without this line `.mjs` wins, `semantic.ts` resolves to the plain-ESM
  // literals file, and every render test that touches a colour dies on
  // "Unexpected token 'export'".
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'node'],

  // `hooks/` is included for ONE kind of file: a `.test.tsx` that mounts a hook
  // in a probe component. `hooks/**/*.spec.ts` stays Vitest's — the extension
  // split is still what holds §5's boundary, and the two globs cannot overlap.
  // `hooks/useDiscoveryGym` needs both sides: the decision is pure and tested
  // there, the retry-that-actually-refetches needs a renderer and a real
  // `QueryClient`, and asserting the second against a mock would be asserting a
  // fiction.
  testMatch: ['<rootDir>/(app|components|hooks|providers)/**/*.test.tsx'],

  // `global.css` is compiled by `withNativeWind` in the Metro build. There is no
  // Metro here, and Jest hands a `.css` file to babel, which fails on the first
  // `@tailwind`. The styles are not what these tests assert — the a11y contract
  // is — so the import resolves to an empty module.
  // A font binary is an ASSET, not a module. `fontAssetMap()` in `@fit/ui-mobile`
  // statically `require()`s six `.ttf` files and treats the result as Metro's
  // numeric asset id; Jest has no asset pipeline, and the files are not in the
  // repo yet either, so the root layout's first render dies on
  // `Cannot find module '…/JetBrainsMono-Regular.ttf'` before any assertion is
  // reached. `moduleNameMapper` matches the REQUEST, before resolution, so this
  // holds whether or not the binaries have landed. See `test-support/font-mock.js`
  // for what is owed once they do.
  moduleNameMapper: {
    '\\.css$': '<rootDir>/test-support/style-mock.js',
    '\\.(ttf|otf|woff2?|eot)$': '<rootDir>/test-support/font-mock.js',
  },

  // THE `.pnpm/` HOP. This is an allowlist expressed as a negative lookahead,
  // and pnpm's store defeats the naive form: every real path is
  // `…/node_modules/.pnpm/<pkg>@<ver>[_peers]/node_modules/<pkg>/…`, so the
  // regex also gets a shot at matching from the FIRST `node_modules/`, where
  // what follows is `.pnpm/` — on nobody's allowlist, so the lookahead succeeds,
  // the path matches, and the package is left untransformed. Any single match
  // means "do not transform", so the second, correct position never gets a say.
  // Without the optional hop below, `jest-expo`'s own setup file is untransformed
  // and every render test dies on `import '@react-native/js-polyfills/error-guard'`
  // before a line of component code is reached.
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-css-interop|nativewind))',
  ],

  // Transform `.mjs` too. `jest-expo` registers exactly one JS transform, keyed
  // `\.[jt]sx?$`, so a `.mjs` file reaches the runtime untransformed and its
  // `export const` throws. Ordinarily fine — nothing in an RN package is `.mjs`
  // — except `@fit/ui-mobile/src/palette.mjs`, which is imported by its explicit
  // `./palette.mjs` specifier, so the extension order above does not save us.
  //
  // The preset has to be named explicitly: `jest-expo` invokes `babel-jest` with
  // `presets: [expo/internal/babel-preset]` as transformer OPTIONS rather than
  // through a `babel.config.js`, so a bare `'babel-jest'` here would run with no
  // presets at all and change nothing.
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

  // ===========================================================================
  // `setImmediate` MUST STAY REAL. Faking it hangs the whole run — forever.
  // ===========================================================================
  //
  // Every screen in this app renders `Screen` from `@fit/ui-mobile`, and
  // `Screen` renders React Native's `<StatusBar animated />`. `StatusBar` is one
  // of the last class components in RN and it batches its native push through
  // `setImmediate`, keeping the handle in a STATIC field:
  //
  //     static _updatePropsStack = () => {
  //       clearImmediate(StatusBar._updateImmediate);
  //       StatusBar._updateImmediate = setImmediate(() => { …setStyle… });
  //     };
  //
  // Under `jest.useFakeTimers()` that `setImmediate` is Sinon's, which returns a
  // plain NUMBER rather than a Node `Immediate` object. The number is stored in
  // the static. Then the fake clock is uninstalled — by `jest.useRealTimers()`,
  // or by Jest's own reset at the end of the file — and RNTL's auto-cleanup
  // unmounts the tree, which calls `popStackEntry` → `_updatePropsStack` →
  // **the real** `clearImmediate(<that number>)`. Node's implementation is:
  //
  //     function clearImmediate(immediate) {
  //       if (!immediate || immediate._destroyed) return;
  //       immediateInfo[kCount]--;              // ← already decremented
  //       immediate._destroyed = true;          // ← THROWS on a number
  //       …
  //     }
  //
  // The counter is decremented for an immediate that was never queued, and only
  // then does the assignment throw. `immediateInfo[kCount]` is what libuv's
  // check phase consults to decide whether immediate work is pending, so from
  // that moment the loop believes it always is: the process spins in
  // `uv__run_check` → `RunAndClearNativeImmediates` with no JS on the stack and
  // never goes idle. Jest never reports, and the run never ends.
  //
  // The symptom is nasty precisely because it looks like nothing else:
  //   * `--testTimeout` does not bound it — the test BODY passed; so did
  //     `afterEach` and `afterAll`. The hang is after the file, in the loop.
  //   * `--forceExit` does not bound it either — that only runs once the test
  //     run completes, and it never completes.
  //   * flushing (`jest.runOnlyPendingTimers()`) does not help: the damage is
  //     the stale numeric handle, not the un-run callback.
  //
  // Setting it here rather than at each call site is deliberate — this is the
  // default `jest.useFakeTimers()` merges into, so a bare call in any spec, in
  // any lane, is safe. Nothing in this app needs a fake `setImmediate`: the
  // timers under test are `setInterval` (the 429 cool-down) and `Date.now`.
  fakeTimers: { doNotFake: ['setImmediate', 'clearImmediate'] },

  collectCoverageFrom: [
    'app/**/*.tsx',
    'components/**/*.{ts,tsx}',
    'providers/**/*.tsx',
    '!**/*.test.tsx',
  ],
};
