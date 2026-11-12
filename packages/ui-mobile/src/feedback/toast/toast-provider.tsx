import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Pressable, View } from 'react-native';

import { clampRadiusTo } from '../../internal/clamp-radius';
import { useSafeInsets } from '../../navigation/floating-tab-bar';
import { Icon } from '../../primitives/icon/icon';
import type { IconName } from '../../primitives/icon/paths';
import { Text } from '../../primitives/text';
import type { ColorRole } from '../../tokens/semantic';
import { layout, spacing } from '../../tokens/spacing';
import { useThemeColors } from '../../tokens/theme';
import { TOAST_AUTO_HIDE_MS, TOAST_FADE_MS, TOAST_GAP, weightedType } from '../feedback-metrics';

import { ToastContext, type ToastApi, type ToastVariant } from './use-toast';

// The shared host slides below the top safe area. Clip the moving pill so
// neither entry nor exit paints over the status bar or notch. RN Animated's
// native driver keeps translation and opacity on the same clock.
// Removal stays on a JS timer, independent of animation completion callbacks.

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
 * Mount it inside the `SafeAreaProvider` — it reads the top inset through
 * `useSafeInsets()`, which degrades to no-inset geometry
 * rather than throwing if there is no provider.
 */
export function ToastProvider({ children, testID }: ToastProviderProps) {
  const colors = useThemeColors();
  const insets = useSafeInsets();
  const [pillHeight, setPillHeight] = useState<number>(PILL_MIN_HEIGHT);

  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);
  // Until the OS preference is known, avoid motion. Also handle live changes.
  const reduceMotion = useRef(true);
  const animationTarget = useRef(0);

  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    const update = (enabled: boolean) => {
      if (!active) return;
      reduceMotion.current = enabled;
      if (enabled) {
        opacity.stopAnimation();
        opacity.setValue(animationTarget.current);
      }
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      preferenceChanged = true;
      update(enabled);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (enabled) => {
        if (!preferenceChanged) update(enabled);
      },
      () => undefined,
    );
    return () => {
      active = false;
      subscription.remove();
      opacity.stopAnimation();
    };
  }, [opacity]);

  const animate = useCallback(
    (toValue: number) => {
      animationTarget.current = toValue;
      opacity.stopAnimation();
      if (reduceMotion.current) {
        opacity.setValue(toValue);
      } else {
        Animated.timing(opacity, {
          toValue,
          duration: TOAST_FADE_MS,
          useNativeDriver: true,
        }).start();
      }
    },
    [opacity],
  );

  const clearTimers = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (removeTimer.current) clearTimeout(removeTimer.current);
    hideTimer.current = null;
    removeTimer.current = null;
  }, []);

  const hide = useCallback(() => {
    clearTimers();
    animate(0);
    // Removal on a JS timer, NOT on the animation callback. See the header.
    removeTimer.current = setTimeout(
      () => {
        setToast(null);
      },
      reduceMotion.current ? 0 : TOAST_FADE_MS,
    );
  }, [animate, clearTimers]);

  const show = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      clearTimers();
      counter.current += 1;
      setToast({ id: counter.current, message, variant });
      opacity.setValue(0);
      animate(1);
      hideTimer.current = setTimeout(hide, TOAST_AUTO_HIDE_MS);
    },
    [animate, clearTimers, hide, opacity],
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
            top: insets.top + TOAST_GAP,
            overflow: 'hidden',
            zIndex: 1,
            alignItems: 'center',
            paddingHorizontal: layout.screenGutter,
          }}
        >
          <Animated.View
            testID={testID ? `${testID}-motion` : undefined}
            pointerEvents="box-none"
            onLayout={(event) => setPillHeight(event.nativeEvent.layout.height)}
            style={{
              opacity,
              maxWidth: '100%',
              transform: [
                {
                  translateY: opacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-pillHeight, 0],
                  }),
                },
              ],
            }}
          >
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
