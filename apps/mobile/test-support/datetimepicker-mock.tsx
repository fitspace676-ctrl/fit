// `@react-native-community/datetimepicker`'s Jest stand-in.
//
// A separate module for the reason `expo-camera-mock.tsx` gives: nativewind
// rewrites `createElement` into a binding a hoisted `jest.mock` factory cannot
// reach. The picker is a native view with no JS fallback, so jest-expo has
// nothing to render for it.
//
// The iOS spinner is a host `View` that keeps only its `testID`. A test that
// needs a day picked reads `onChange` off the element (`UNSAFE_getByType`) and
// calls it, which is what the native side does. The Android dialog is an
// imperative `open()`, so it is a `jest.fn` a test can inspect and answer.
import { View } from 'react-native';

interface DateTimePickerProps {
  testID?: string;
  value: Date;
  onChange?: (event: { type: string }, date?: Date) => void;
}

/** A host view that forwards `testID` and nothing else. */
export default function DateTimePicker({ testID }: DateTimePickerProps) {
  return <View testID={testID} />;
}

export const DateTimePickerAndroid = {
  open: jest.fn(),
  dismiss: jest.fn(),
};
