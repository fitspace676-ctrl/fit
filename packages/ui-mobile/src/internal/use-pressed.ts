// `usePressed` — press feedback as a BACKGROUND STEP, never an opacity fade.
//
// ---------------------------------------------------------------------------
// WHY NOT `TouchableOpacity`, AND WHY NOT `opacity` AT ALL.
//
// The direction is flat fills on a charcoal canvas. React Native's default
// touch feedback — and every `activeOpacity` in the old package — multiplies
// the whole subtree's alpha, which on this palette produces two specific
// failures:
//
//   · A lime fill (`brand-300` #E4F26A) at 70% over `ink-950` (#131312) does
//     not read as "a dimmer lime". It reads as a muddy olive, because the
//     charcoal underneath is a WARM neutral, not black. The one colour the
//     product owns goes off-brand for the duration of every tap.
//   · A translucent surface fades the text with the fill, so the label goes
//     grey at the exact moment the user is looking at it hardest.
//
// So every `hover:` class in the artboards becomes a pressed BACKGROUND, taken
// one step along the same ramp — `bg-ink-900 → hover:bg-ink-800`,
// `bg-brand-300 → hover:bg-brand-200`, `text-ink-300 → hover:text-white`. Both
// endpoints are palette members, so the pressed state is as inspectable, and
// as guarded, as the resting one.
//
// (The artboards also carry two `hover:scale-105` transforms. Those are NOT
// ported: a scale on a 44px circle inside a scrolling list fights the scroll
// gesture's own responder handoff and produces a visible jitter on the frame
// the touch is cancelled. The equivalent lime step, `brand-300 → brand-200`,
// is used in their place — and the artboards themselves use exactly that step
// on the *other* accent buttons, so it is the design's own answer.)
// ---------------------------------------------------------------------------

import { useCallback, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';

/** Handlers to spread onto a `Pressable`, plus the current pressed flag. */
export interface PressedState {
  pressed: boolean;
  onPressIn: (event: GestureResponderEvent) => void;
  onPressOut: (event: GestureResponderEvent) => void;
}

/**
 * Track the pressed state of a `Pressable` as a boolean.
 *
 * `Pressable` already exposes `({ pressed }) => …` through its render-prop
 * `style`, but that channel only reaches `style` — it cannot drive a child's
 * colour, which is precisely what this design needs (an icon that goes
 * `ink-300 → white` under the finger while its plate goes `ink-800 → ink-700`).
 * A state hook can drive both from one source of truth.
 *
 * `onPressIn` / `onPressOut` passed by the caller are chained, not replaced:
 * swallowing a caller's handler is the kind of quiet breakage that gets a
 * component re-implemented locally.
 */
export function usePressed(
  onPressIn?: ((event: GestureResponderEvent) => void) | null,
  onPressOut?: ((event: GestureResponderEvent) => void) | null,
): PressedState {
  const [pressed, setPressed] = useState(false);

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      setPressed(true);
      onPressIn?.(event);
    },
    [onPressIn],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      setPressed(false);
      onPressOut?.(event);
    },
    [onPressOut],
  );

  return { pressed, onPressIn: handlePressIn, onPressOut: handlePressOut };
}
