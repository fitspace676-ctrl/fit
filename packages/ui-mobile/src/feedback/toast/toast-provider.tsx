import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { clampRadiusTo } from '../../internal/clamp-radius';
import { useTabBarInset } from '../../navigation/floating-tab-bar';
import { Icon } from '../../primitives/icon/icon';
import type { IconName } from '../../primitives/icon/paths';
import { Text } from '../../primitives/text';
import type { ColorRole } from '../../tokens/semantic';
import { layout, spacing } from '../../tokens/spacing';
import { useThemeColors } from '../../tokens/theme';
import {
  TOAST_AUTO_HIDE_MS,
  TOAST_FADE_MS,
  toastBottomOffset,
  weightedType,
} from '../feedback-metrics';

import { ToastContext, type ToastApi, type ToastVariant } from './use-toast';

// ===========================================================================
// THE TOAST HOST. Salvaged API, rebuilt visual, moved anchor.
//
// The API (`show`/`success`/`error`/`info`/`hide`) is kept verbatim — see
// `use-toast.ts`. Two things are rewritten, and both were wrong rather than
// merely dated:
//
//   THE VISUAL. The salvage drew a full-width rounded rectangle filled with
//   `palette.success[600]` / `danger[600]` / `info[600]` — three ramps that no
//   longer exist. `success` and `info` were retired outright by the August
//   repaint (see `RETIRED_RAMPS`), so the old provider could not be ported;
//   it could only be redrawn. The artboards have exactly one toast
//   (`mobile-class-detail.tsx:232-237`) and it is a LIME PILL with a leading
//   check: `rounded-pill bg-brand-300 px-4 py-2.5 text-[13px] font-bold
//   text-ink-950`.
//
//   THE ANCHOR. The salvage pinned to `insets.top + 8`. All six artboards put
//   a 44pt header action in the top-right — the cart, the filter, the settings
//   button — so a top toast lands on the control the member is most likely to
//   reach for next, and whether their tap dismisses the toast or opens the
//   cart depends on a three-second timer. The bottom is free by construction:
//   `useTabBarInset()` is the space every screen ALREADY reserves so its last
//   row clears the floating capsule.
//
// ---------------------------------------------------------------------------
// WHY RN `Animated` AND NOT REANIMATED HERE, WHEN `Sheet` USES REANIMATED.
//
// This is one interpolated opacity with no gesture input and no second
// property to keep in sync — precisely the case RN's native driver exists for,
// and precisely the case `primitives/spinner.tsx` already decided the same way
// for the same reason. `Sheet` needs Reanimated because it drives a translate
// and a scrim opacity off ONE clock across a `Modal` boundary; a toast drives
// one number.
//
// The consequence that matters: the toast's REMOVAL is driven by
// `setTimeout`, never by the animation's completion callback. An animation
// callback under fake timers may never fire, and a toast that renders forever
// in a test is a test that passes for the wrong reason.
// ---------------------------------------------------------------------------
// ===========================================================================

/** Variant -> fill, foreground, hairline and glyph. */
const VARIANTS = {
  /** The artboard's own: lime pill, ink text, leading check. */
  success: { background: 'accent', foreground: 'onAccent', border: null, icon: 'check' },
  /**
   * The only other tone the design speaks. Red fill, white text — the same
   * pair `Button`'s `destructive` uses, so "something failed" looks the same
   * whether it arrives as a toast or as a button.
   */
  error: { background: 'error', foreground: 'onError', border: null, icon: 'info' },
  /**
   * NO ARTBOARD DRAWS THIS ONE, so it is a choice and it is recorded here.
   * The neutral plate (`quiet`) with white text and a hairline: it must not
   * borrow the lime, which in this design means "done", nor the red, which
   * means "failed" — and on an `ink-950` canvas an `ink-800` pill needs the
   * hairline to separate from the ground at all.
   */
  info: { background: 'quiet', foreground: 'textPrimary', border: 'border', icon: 'info' },
} as const satisfies Record<
  ToastVariant,
  {
    background: ColorRole;
    foreground: ColorRole;
    border: ColorRole | null;
    icon: IconName;
  }
>;

/** `px-4 py-2.5` on the artboard's pill. */
const PILL_PAD_H = spacing[4];
const PILL_PAD_V = spacing[2.5];

/** `h-4 w-4` — the leading check. */
const PILL_GLYPH = spacing[4];

/** The minimum height, so the pill clears the 44pt floor as a touch target. */
const PILL_MIN_HEIGHT = layout.minTouchTarget;

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
}

export interface ToastProviderProps {
  children: ReactNode;
  /**
   * Forwarded to the toast PILL — the provider itself renders no box. The
   * full-width host that positions it takes `${testID}-host`.
   */
  testID?: string;
}

/**
 * Mounts the toast host and provides {@link useToast} to the tree.
 *
 * ONE TOAST AT A TIME, and a second replaces the first rather than stacking.
 * Stacking would need a queue, a per-item timer and a decision about what
 * happens when five arrive at once; a member who has triggered two things in
 * three seconds needs the SECOND result, and the first is already stale.
 *
 * Mount it inside the `SafeAreaProvider` — it reads the bottom inset through
 * `useTabBarInset()`, which degrades to the artboards' no-inset geometry
 * rather than throwing if there is no provider.
 */
export function ToastProvider({ children, testID }: ToastProviderProps) {
  const colors = useThemeColors();
  const tabBarInset = useTabBarInset();

  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const clearTimers = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (removeTimer.current) clearTimeout(removeTimer.current);
    hideTimer.current = null;
    removeTimer.current = null;
  }, []);

  const hide = useCallback(() => {
    clearTimers();
    Animated.timing(opacity, {
      toValue: 0,
      duration: TOAST_FADE_MS,
      useNativeDriver: true,
    }).start();
    // Removal on a JS timer, NOT on the animation callback. See the header.
    removeTimer.current = setTimeout(() => {
      setToast(null);
    }, TOAST_FADE_MS);
  }, [clearTimers, opacity]);

  const show = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      clearTimers();
      counter.current += 1;
      setToast({ id: counter.current, message, variant });
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: TOAST_FADE_MS,
        useNativeDriver: true,
      }).start();
      hideTimer.current = setTimeout(hide, TOAST_AUTO_HIDE_MS);
    },
    [clearTimers, hide, opacity],
  );

  // A provider unmounting mid-toast — a sign-out, a locale switch — must not
  // leave two timers holding a `setState` on a dead tree.
  useEffect(() => clearTimers, [clearTimers]);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message: string) => {
        show(message, 'success');
      },
      error: (message: string) => {
        show(message, 'error');
      },
      info: (message: string) => {
        show(message, 'info');
      },
      hide,
    }),
    [show, hide],
  );

  const spec = toast ? VARIANTS[toast.variant] : null;

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && spec ? (
        <View
          testID={testID ? `${testID}-host` : undefined}
          // `box-none` so the host, which spans the screen's width, does not
          // eat taps aimed at whatever is underneath it.
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: toastBottomOffset(tabBarInset),
            alignItems: 'center',
            paddingHorizontal: layout.screenGutter,
          }}
        >
          <Animated.View style={{ opacity, maxWidth: '100%' }}>
            <Pressable
              // `alert` + an ASSERTIVE live region: a toast is the only
              // feedback for an action the member just took, and a polite
              // region would queue behind whatever is being read and arrive
              // after the toast has gone.
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              accessibilityLabel={toast.message}
              onPress={hide}
              testID={testID}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing[2],
                minHeight: PILL_MIN_HEIGHT,
                paddingHorizontal: PILL_PAD_H,
                paddingVertical: PILL_PAD_V,
                borderRadius: clampRadiusTo('full', PILL_MIN_HEIGHT),
                backgroundColor: colors[spec.background],
                ...(spec.border
                  ? { borderWidth: layout.hairline, borderColor: colors[spec.border] }
                  : {}),
              }}
            >
              <Icon name={spec.icon} color={spec.foreground} size={PILL_GLYPH} />
              {/* 13/700 — the artboard's `text-[13px] font-bold`, which the
                  scale carries at 13/400. Only the weight moves. */}
              <Text
                color={spec.foreground}
                accessible={false}
                style={[weightedType('bodySmall', '700'), { flexShrink: 1 }]}
              >
                {toast.message}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}
