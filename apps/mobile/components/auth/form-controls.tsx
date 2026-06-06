// @fit/mobile — shared building blocks for the (auth) screens.
//
// The login / register / forgot / reset screens all want the same labelled
// input, primary button (with a busy state), and inline error line on the dark
// brand background, so they live here once instead of being re-styled per
// screen — the mobile mirror of web's `_components/auth/form-controls`.

import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

/** Inline form error. Renders nothing when there is no message. */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text className="w-full text-sm text-red-400">{message}</Text>;
}

/** Inline success / informational note. Renders nothing when there is no message. */
export function AuthNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text className="w-full text-sm text-green-400">{message}</Text>;
}

/** A labelled text input styled for the dark brand background. */
export function AuthField({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View className="w-full gap-1">
      <Text className="text-sm font-medium text-brand-200">{label}</Text>
      <TextInput
        placeholderTextColor="#8ec1ff"
        className="rounded-card border border-brand-700 bg-brand-900 px-4 py-3 text-base text-white"
        {...props}
      />
    </View>
  );
}

/**
 * Primary submit button. Shows a spinner + `busyLabel` while `busy`, and is
 * disabled while busy or when `disabled` is set so a form can't be double-fired.
 */
export function AuthButton({
  label,
  busyLabel,
  busy = false,
  disabled = false,
  onPress,
}: {
  label: string;
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const inactive = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={inactive}
      onPress={onPress}
      className={`w-full flex-row items-center justify-center gap-2 rounded-card bg-brand-500 px-6 py-3 ${
        inactive ? 'opacity-60' : ''
      }`}
    >
      {busy ? <ActivityIndicator color="#ffffff" /> : null}
      <Text className="text-base font-medium text-white">
        {busy ? (busyLabel ?? label) : label}
      </Text>
    </Pressable>
  );
}
