// Jest setup for the mobile design system's render tests.
//
// Render tests here assert the **accessibility contract**, not pixels: that a
// `testID` reaches the root node, that `accessibilityRole` is set, and that
// `minHeight + hitSlop >= 44`. A snapshot of a style object would lock in
// today's tokens and fail on every legitimate repaint, which is exactly the
// kind of test that gets deleted rather than fixed.
import '@testing-library/jest-native/extend-expect';

// Reanimated's Jest mock.
//
// NOT the upstream `react-native-reanimated/mock` recipe. That is the Reanimated
// **3** instruction and it is actively broken on 4: `mock.ts` imports the real
// `./index`, which pulls `react-native-worklets`, whose `NativeWorklets`
// constructor throws on require under Jest ("Native part of Worklets doesn't
// seem to be initialized"). The failure is total — the suite dies before a
// component renders — and it lay dormant until `Sheet` became the first module
// under `src/**` to import Reanimated at all.
//
// `test-support/reanimated-mock.ts` is a hand-written stand-in covering only
// what this package's components use. Extend it there rather than reaching for
// the upstream mock again.
// A `jest.mock` factory is hoisted above the import block, so it cannot close
// over an ESM binding; `require` is the only form that works here.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return
jest.mock('react-native-reanimated', () => require('./test-support/reanimated-mock'));

// NOTE. There used to be a `jest.mock('react-native/Libraries/Animated/
// NativeAnimatedHelper', …, { virtual: true })` here, to silence the
// `useNativeDriver` warning. It is gone because React Native moved that module
// under `src/private/` and `jest-expo`'s `moduleNameMapper` rewrites every
// `react-native/*` specifier to a concrete path in the pnpm store BEFORE
// `virtual: true` gets a say — so the mock resolved to a file that does not
// exist and took down every render test with a configuration error. `jest-expo`
// already stubs the native animated module; nothing needs to be mocked here.
