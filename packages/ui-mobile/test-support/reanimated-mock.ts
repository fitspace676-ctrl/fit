// A hand-rolled `react-native-reanimated` mock, for this package's render tests.
//
// ===========================================================================
// WHY THIS EXISTS, GIVEN `jest.setup.ts` ALREADY MOCKS REANIMATED.
//
// It does, and the mock it installs is broken — it just has not been exercised
// before now, because nothing under `src/**` imported Reanimated until `Sheet`
// did. `jest.setup.ts` does:
//
//     jest.mock('react-native-reanimated', () =>
//       jest.requireActual('react-native-reanimated/mock'));
//
// which is the documented recipe for Reanimated 3. In Reanimated 4, `mock.ts`
// begins by importing the REAL `./index` (for `Extrapolation`, `ReduceMotion`,
// `setUpTests` and friends), and `./index` pulls in `react-native-worklets`,
// whose `NativeWorklets` constructor throws
//
//     WorkletsError: [Worklets] Native part of Worklets doesn't seem to be
//     initialized.
//
// on require, under Jest, where there is no native side. So the shipped mock
// takes the suite down before a single component renders.
//
// `jest.setup.ts` is WP-6's file and this work package does not write there,
// so the fix lands as a per-file override: a test that mounts an animated
// component declares
//
//     jest.mock('react-native-reanimated', () => require('./reanimated.test-mock'));
//
// which re-registers the module factory and means the broken one is never
// invoked. A registration in a test file wins over one in `setupFilesAfterEach`.
//
// THIS IS A ONE-LINE FIX OWED BACK TO `jest.setup.ts` — see the report for
// WP-8b. Once that file swaps its factory for this shape, every
// `jest.mock(...)` line in `src/feedback/*.test.tsx` can be deleted.
// ===========================================================================

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
