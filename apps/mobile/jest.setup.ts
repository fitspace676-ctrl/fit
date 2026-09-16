// Jest setup for the mobile app's render tests.
//
// What these tests assert is the DEFINITION OF DONE (plan §6), branch by
// branch: loading, empty, error-with-a-working-retry, offline, and the
// signed-out branch of a public route — plus the a11y contract (`testID` on the
// root, one `accessibilityRole="header"` per screen, a name on every control).
// Never a style snapshot: that would lock in today's tokens and fail on the next
// legitimate repaint, which is the kind of test that gets deleted rather than
// fixed.
import '@testing-library/jest-native/extend-expect';

// Reanimated's Jest mock.
//
// NOT the upstream `react-native-reanimated/mock` recipe. That is the Reanimated
// **3** instruction and it is actively broken on 4: `mock.ts` imports the real
// `./index`, which pulls `react-native-worklets`, whose `NativeWorklets`
// constructor throws on require under Jest ("Native part of Worklets doesn't
// seem to be initialized"). The failure is total — the suite dies before a
// component renders.
//
// The app itself imports no Reanimated directly, but `@fit/ui-mobile`'s
// `ToastProvider` and `Sheet` do, and the root layout mounts `ToastProvider`.
// So the mock is needed here for the same reason it is needed there.
//
// A `jest.mock` factory is hoisted above the import block, so it cannot close
// over an ESM binding; `require` is the only form that works.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return
jest.mock('react-native-reanimated', () => require('./test-support/reanimated-mock'));

// `expo-font` loads four registered families off disk. There is no disk here,
// and `useFormacoreFonts()` is called by the root layout, so without this the
// splash gate can never resolve under test. Reporting "loaded" is the right
// stand-in: the interesting branch (an *errored* load must still hide the
// splash) is asserted by overriding this per test.
//
// `useFonts` is a `jest.fn` RATHER THAN A PLAIN ARROW precisely so it can be
// overridden — `app/_layout.test.tsx` drives it to `[false, Error]` to prove the
// splash still comes down on a corrupt asset, and to `[false, null]` to prove it
// does not come down early. A plain arrow makes that branch untestable, and it
// is the branch that hangs the app on a real device.
//
// The default implementation survives `jest.clearAllMocks()` (which clears calls,
// not implementations). A spec that calls `jest.resetAllMocks()` must re-seed it,
// or `const [loaded, error] = useFonts(…)` destructures `undefined`.
jest.mock('expo-font', () => ({
  useFonts: jest.fn(() => [true, null]),
  loadAsync: jest.fn(() => Promise.resolve(undefined)),
  isLoaded: () => true,
}));

// `expo-camera` is a native view plus a native permissions module, and jest-expo
// stubs neither: `useCameraPermissions()` reaches for `ExpoCamera` and throws on
// require, before `app/qr.tsx` renders a line.
//
// The DEFAULT IS "GRANTED", so the interesting state — the live camera — is the
// one a test gets for free. The other three are overrides, and they are the ones
// that actually differ in copy: `{granted:false, canAskAgain:true}` is "ask",
// `{granted:false, canAskAgain:false}` is "only Settings will help", and `null`
// is "the module has not answered yet". `app/qr.test.tsx` drives all four
// through this `jest.fn`, which is why it is a mock function rather than an
// arrow — the same reasoning as `expo-font` above.
//
// The stub lives in its own module — see its header for why an inline factory
// cannot work here (nativewind rewrites `createElement`, and a `jest.mock`
// factory may not reach the binding that rewrite needs). Same shape as the
// Reanimated mock above, and `require` for the same hoisting reason.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return
jest.mock('expo-camera', () => require('./test-support/expo-camera-mock'));

// `expo-splash-screen` talks to a native module. The root layout's contract —
// hide exactly once, and only after fonts have loaded OR errored — is asserted
// against these spies.
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
  setOptions: jest.fn(),
}));
