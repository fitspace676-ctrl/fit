// A hand-rolled `react-native-reanimated` mock, for the app's render tests.
//
// Copied verbatim (below the header) from `packages/ui-mobile/test-support/`,
// because the app hits the same wall: the upstream
// `react-native-reanimated/mock` is the Reanimated **3** recipe, and on 4 its
// `mock.ts` imports the real `./index`, which pulls `react-native-worklets`,
// whose `NativeWorklets` constructor throws on require under Jest ("Native part
// of Worklets doesn't seem to be initialized"). The suite dies before a
// component renders.
//
// The app imports no Reanimated itself. `@fit/ui-mobile`'s `ToastProvider` does,
// and the root layout mounts it, so every screen test transitively needs this.
//
// Kept as a copy rather than imported across the package boundary: this is test
// scaffolding, not public API, and `@fit/ui-mobile`'s barrel deliberately
// exposes nothing from `test-support/`. Extend it here for what the app uses.

import { useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';

const identity = <T>(value: T): T => value;

/**
 * A shared value that actually persists across renders.
 *
 * The upstream mock returns a fresh `{ value }` on every render, so a value
 * written in an effect is gone by the next paint. A ref is one line and makes
 * the mock behave like the thing it stands in for.
 */
export function useSharedValue<T>(initial: T): { value: T } {
  const ref = useRef({ value: initial });
  return ref.current;
}

/** Runs the worklet immediately and hands back the style object. */
export function useAnimatedStyle<T>(factory: () => T): T {
  return factory();
}

/** Jumps straight to the target — there is no clock here to run against. */
export function withTiming<T>(toValue: T): T {
  return toValue;
}

export function withSpring<T>(toValue: T): T {
  return toValue;
}

export function withDelay<T>(_delayMs: number, animation: T): T {
  return animation;
}

export function cancelAnimation(): void {
  /* nothing is animating */
}

export const runOnJS = identity;
export const runOnUI = identity;

export const Easing = {
  linear: identity,
  ease: identity,
  quad: identity,
  cubic: identity,
  sin: identity,
  circle: identity,
  exp: identity,
  in: identity,
  out: identity,
  inOut: identity,
  bezier: () => ({ factory: identity }),
};

/** `Animated.View` and friends, as the plain host components. */
const Animated = {
  View,
  Text,
  ScrollView,
  createAnimatedComponent: identity,
};

export default Animated;
