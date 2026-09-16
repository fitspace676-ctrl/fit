// `expo-camera`'s Jest stand-in.
//
// A SEPARATE MODULE RATHER THAN AN INLINE `jest.mock` FACTORY, and the reason is
// nativewind. Its babel plugin rewrites every `createElement` in a transformed
// file to `_ReactNativeCSSInterop.createElement` — a module-scope binding it
// injects at the top. A `jest.mock` factory is hoisted above that binding and
// jest refuses out-of-scope variable access inside one, so the inline form dies
// with "Invalid variable access: _ReactNativeCSSInterop" before a test runs.
// Here the rewrite happens in this file's own scope, where the binding exists.
// `test-support/reanimated-mock.ts` is the same shape for the same class of
// reason; `jest.setup.ts` wires both.
//
// WHAT THE DEFAULTS ARE, AND WHY. Permission is GRANTED, so the interesting
// state — a live camera — is what a test gets for free. The three states that
// differ in copy are overrides: `{granted:false, canAskAgain:true}` is "we can
// still ask", `{granted:false, canAskAgain:false}` is "only Settings will help",
// and `null` is "the module has not answered yet". `useCameraPermissions` is a
// `jest.fn` precisely so `app/qr.test.tsx` can drive all four — the same
// reasoning as the `expo-font` mock.
import { View } from 'react-native';

/** `PermissionResponse`, narrowed to the three fields the screen reads. */
const GRANTED = { granted: true, canAskAgain: true, status: 'granted', expires: 'never' };

export const useCameraPermissions = jest.fn(() => [
  GRANTED,
  jest.fn(() => Promise.resolve(GRANTED)),
  jest.fn(() => Promise.resolve(GRANTED)),
]);

interface CameraViewProps {
  testID?: string;
  style?: unknown;
  /**
   * Accepted and DROPPED. It is a native callback, not a bubbling event: RNTL
   * cannot raise one, and passing a function down to a host `View` only makes
   * React warn. A test that needs a scan reads this prop off the element and
   * calls it — which is also what asserts the "detached after one code" rule.
   */
  onBarcodeScanned?: (result: { type: string; data: string }) => void;
  barcodeScannerSettings?: unknown;
  facing?: string;
}

/** A host view that forwards `testID` and nothing else. */
export function CameraView({ testID, style }: CameraViewProps) {
  return <View testID={testID} style={style as never} />;
}
