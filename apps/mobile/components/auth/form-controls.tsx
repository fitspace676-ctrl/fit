// @fit/mobile — shared building blocks for the (auth) screens.
//
// The login / register / forgot / reset screens all share the same look: the
// formacore "Aurora Glass" sign-in — a near-black `ink-950` canvas with
// translucent "glass" fields (a faint white fill + hairline border), a solid
// brand primary button, and glass social / segmented controls. Keeping them
// here means every auth screen stays on the design from ONE source, the mobile
// mirror of web's `_components/auth/form-controls`.

import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
} from 'react-native';

/** Placeholder tint used across every auth field (formacore `ink-500`). */
export const AUTH_PLACEHOLDER = '#646D82';

/** Shared glass surface — a faint white fill over the dark canvas + hairline. */
const GLASS = 'rounded-btn bg-white/5 border border-white/10';

/** Inline form error. Renders nothing when there is no message. */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text className="w-full text-sm text-danger-300">{message}</Text>;
}

/** Inline success / informational note. Renders nothing when there is no message. */
export function AuthNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text className="w-full text-sm text-success-300">{message}</Text>;
}

/**
 * A labelled glass text input. Used by register / forgot / reset, where a field
 * label reads better than a placeholder-only control. The sign-in screen uses
 * the leaner {@link GlassField} instead.
 */
export function AuthField({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View className="w-full gap-1.5">
      <Text className="text-sm font-medium text-ink-300">{label}</Text>
      <View className={`w-full flex-row items-center px-4 py-3.5 ${GLASS}`}>
        <TextInput
          placeholderTextColor={AUTH_PLACEHOLDER}
          className="flex-1 text-base text-white"
          {...props}
        />
      </View>
    </View>
  );
}

/**
 * A placeholder-only glass input row with an optional trailing slot (e.g. a
 * show/hide password toggle). The sign-in workhorse — label-less to match the
 * formacore mobile artboard.
 */
export function GlassField({ trailing, ...props }: { trailing?: ReactNode } & TextInputProps) {
  return (
    <View className={`w-full flex-row items-center gap-2 px-4 py-3.5 ${GLASS}`}>
      <TextInput
        placeholderTextColor={AUTH_PLACEHOLDER}
        className="flex-1 text-base text-white"
        {...props}
      />
      {trailing}
    </View>
  );
}

/**
 * Primary submit button — a solid brand fill (the mobile mirror of web's
 * gradient CTA, which `className` can't paint in React Native). Shows a spinner
 * + `busyLabel` while `busy`, and blocks presses while busy or `disabled` so a
 * form can't be double-fired. `trailing` renders after the label (e.g. an arrow).
 */
export function AuthButton({
  label,
  busyLabel,
  busy = false,
  disabled = false,
  trailing,
  onPress,
  testID,
}: {
  label: string;
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  trailing?: ReactNode;
  onPress: () => void;
  /** Stable identifier for end-to-end (Maestro) selectors. */
  testID?: string;
}) {
  const inactive = busy || disabled;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      className={`w-full flex-row items-center justify-center gap-2 rounded-btn bg-brand-600 px-6 py-4 active:bg-brand-700 ${
        inactive ? 'opacity-60' : ''
      }`}
    >
      {busy ? <ActivityIndicator color="#ffffff" /> : null}
      <Text className="text-base font-semibold text-white">
        {busy ? (busyLabel ?? label) : label}
      </Text>
      {busy ? null : trailing}
    </Pressable>
  );
}

/**
 * A glass secondary button — the OAuth ("Continue with …") controls. `leading`
 * renders before the label so callers can pass a provider glyph.
 */
export function SocialButton({
  label,
  onPress,
  disabled = false,
  leading,
  className = '',
  ...rest
}: {
  label: string;
  leading?: ReactNode;
  className?: string;
} & Omit<PressableProps, 'children' | 'style'>) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`flex-row items-center justify-center gap-2 px-4 py-3.5 ${GLASS} active:bg-white/10 ${
        disabled ? 'opacity-60' : ''
      } ${className}`}
      {...rest}
    >
      {leading}
      <Text className="text-sm font-semibold text-white">{label}</Text>
    </Pressable>
  );
}

/** One option in an {@link AuthSwitch}. */
export interface AuthSwitchOption {
  key: string;
  label: string;
  onPress: () => void;
}

/**
 * A two-up segmented switch (Sign in / Create account) matching the formacore
 * mobile artboard: a glass track with a solid-white pill under the active tab.
 */
export function AuthSwitch({
  value,
  options,
}: {
  value: string;
  options: readonly AuthSwitchOption[];
}) {
  return (
    <View className={`w-full flex-row gap-1 p-1 ${GLASS}`}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={opt.onPress}
            className={`h-10 flex-1 items-center justify-center rounded-field ${
              active ? 'bg-white' : ''
            }`}
          >
            <Text className={`text-sm font-semibold ${active ? 'text-ink-950' : 'text-ink-400'}`}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
