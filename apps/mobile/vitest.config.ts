import { defineConfig } from 'vitest/config';

/**
 * The mobile app's **fast** unit suite.
 *
 * §5 of the rebuild plan draws one hard boundary: Vitest for everything that
 * does not import `react-native`, `jest-expo` + `@testing-library/react-native`
 * only for render tests. React Native ships Flow-typed source Vitest cannot
 * parse, so the boundary is not a preference — a single stray `import
 * 'react-native'` in a module under `lib/` turns its spec into a parse error.
 *
 * That is why `include` is scoped to `lib/**` and `hooks/**`: those are the
 * layers the plan requires to be renderer-free, and keeping the glob narrow
 * means a component spec added under `app/` fails loudly here rather than being
 * silently half-run. Modules that genuinely need SecureStore / AsyncStorage /
 * NetInfo take their platform module as an injected dependency
 * (`setSecureStorage`, `wireQueryBridges`) or reach it through an indirected
 * dynamic import that the unit suite never executes
 * (`installExpoSecureStore`, `installReactNativeBridges`).
 *
 * `environment: 'node'` because nothing here touches a DOM — `fetch`,
 * `AbortController`, `URLSearchParams` and `TextDecoder` are all Node 20
 * globals.
 */
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // `app/**/*.spec.ts` is a NARROW third entry, not a widening of the rule.
    // Exactly one module under `app/` is renderer-free and has to live there:
    // `app/+native-intent.ts`, whose filename is Expo Router's own convention
    // and cannot be moved to `lib/`. Its rewrite table — including the web
    // `[locale]` strip, which §5 names explicitly — is on the must-have list,
    // and it imports nothing from `react-native`. The `.spec.ts` / `.test.tsx`
    // extension split still holds the boundary: a SCREEN spec added under
    // `app/` would import `react-native`, fail to parse here, and say so.
    include: ['lib/**/*.spec.ts', 'hooks/**/*.spec.ts', 'app/**/*.spec.ts'],
    exclude: ['node_modules/**', '.expo/**', 'ios/**', 'android/**'],
  },
});
