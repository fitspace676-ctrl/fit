import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { IconButton } from '../forms/icon-button';
import { DECORATIVE } from '../internal/a11y';
import { clampRadiusTo } from '../internal/clamp-radius';
import { useSafeInsets } from '../navigation/floating-tab-bar';
import { Text } from '../primitives/text';
import { layout, spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

import {
  SHEET_CLOSE_SIZE,
  SHEET_ENTER_MS,
  SHEET_EXIT_MS,
  SHEET_GRABBER_HEIGHT,
  SHEET_GRABBER_WIDTH,
  SHEET_MAX_HEIGHT_RATIO,
  SHEET_RADIUS,
  sheetBodyMaxHeight,
  sheetBottomPad,
} from './feedback-metrics';

// ===========================================================================
// THE BOTTOM SHEET. Five artboards carry this chrome, byte for byte:
//
//   mobile-home-v2.tsx:508-678      the QR pass
//   mobile-classes.tsx:440-528      the filters
//   mobile-class-detail.tsx:263-329 the booking confirmation
//   mobile-shop.tsx:270-386         the cart
//   mobile-profile.tsx:356-416      the membership freeze
//
// Scrim `bg-ink-950/85`, tappable. Panel `rounded-t-[32px] bg-ink-900 px-5 pb-8
// pt-3`. An `h-1 w-10` grabber. A header with a 22/800 title, an optional 13
// muted subtitle and a 40x40 round close. A body. A footer of `h-[52px] flex-1`
// buttons.
//
// ===========================================================================
// WHY `Modal` AND NOT AN ABSOLUTELY-POSITIONED VIEW IN THE TREE.
//
// The artboards draw the sheet as `absolute inset-0 z-20` inside the screen,
// because a browser has one stacking context and `z-20` wins it. React Native
// does not: a view absolutely positioned inside a screen is still a child of
// the tab navigator's container and is CLIPPED by it, so the scrim stops at
// the navigator's bounds and the sheet renders behind the floating capsule.
// `Modal` is a separate native window, which also buys:
//
//   · `onRequestClose` — Android's hardware back button. Without it, back
//     pops the ROUTE while the sheet is open, which is the single most common
//     "the app went somewhere I did not ask for" bug on Android.
//   · `statusBarTranslucent` — otherwise the scrim stops below the status bar
//     and `inset-0` is a lie on exactly the devices the design was drawn for.
//
// WHY NOT `@gorhom/bottom-sheet`. It requires `react-native-gesture-handler`,
// which is not in this repo's dependency set. Adding it means a second native
// gesture system alongside RN's own responder chain, plus an EAS rebuild,
// bought for one drag affordance. Reanimated is already a dependency and drives
// both animated properties from one clock.
//
// DRAG-TO-DISMISS IS OUT OF SCOPE FOR v1 — scrim tap, close button and
// hardware back cover it. That is why the grabber is `accessible={false}`: an
// announced grab handle that cannot be grabbed is worse than no handle.
// ===========================================================================

/** The enter/exit curve. Decelerating, so the panel arrives rather than stops. */
const ENTER = { duration: SHEET_ENTER_MS, easing: Easing.out(Easing.cubic) } as const;
const EXIT = { duration: SHEET_EXIT_MS, easing: Easing.out(Easing.cubic) } as const;

/** `pt-3` — the gap above the grabber. */
const PANEL_PAD_TOP = spacing[3];

/** `mb-5` — the gap below the grabber. */
const GRABBER_GAP = spacing[5];

/** `px-5` — the same gutter the screens use. */
const PANEL_GUTTER = layout.screenGutter;

/** The travel used before the panel has been measured. Always off-screen. */
const FALLBACK_TRAVEL = 640;

/** The gap between the body and the footer row. */
const FOOTER_GAP = spacing[6];

export interface SheetProps {
  /** Open it. Closing animates out; the `Modal` stays mounted until it has. */
  open: boolean;

  /**
   * Called by the scrim, by the close button and by Android's hardware back.
   *
   * The sheet does NOT close itself: `open` is the screen's state. That is
   * what makes the single-instance rule below enforceable.
   */
  onClose: () => void;

  /**
   * REQUIRED. The 22/800 line at the top, and the node VoiceOver is moved to
   * when the sheet appears.
   */
  title: string;

  /** The 13 muted line under the title. */
  subtitle?: string;

  /**
   * REQUIRED. The close button is icon-only, so package rule 1 makes its name
   * a required prop rather than a default the caller can forget.
   */
  closeAccessibilityLabel: string;

  /** The scrollable body. */
  children?: ReactNode;

  /**
   * The CTA row. Rendered OUTSIDE the ScrollView — see the note on
   * `sheetBodyMaxHeight`. Buttons in here want `style={{flexGrow: 1,
   * flexBasis: 0}}`, which is the artboards' `h-[52px] flex-1`.
   */
  footer?: ReactNode;

  /** How much of the window the sheet may occupy. Default 0.85. */
  maxHeightRatio?: number;

  /** Hide the close button — for a sheet whose footer already has one. */
  showClose?: boolean;

  /** Forwarded to the PANEL, which is this component's root. */
  testID?: string;

  /** Merged last onto the panel, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last onto the panel. */
  className?: string;
}

/**
 * A bottom sheet.
 *
 * ---------------------------------------------------------------------------
 * ONE SHEET PER SCREEN. THIS COMPONENT DOES NOT ENFORCE IT; THE SCREEN MUST.
 *
 * The home screen opens the QR sheet from two places — the nav's centre action
 * and the membership card. Two `Modal`s whose `visible` overlaps for even one
 * frame produce a black flash on iOS, because the first one's dismissal
 * animation and the second one's presentation animation both own the window.
 *
 * The fix is structural and belongs to the screen: hold ONE piece of state,
 *
 *     const [sheet, setSheet] = useState<'qr' | 'filters' | null>(null);
 *
 * and render one `<Sheet open={sheet === 'qr'} …>` per kind. Trying to solve
 * it inside this component would mean a module-level registry of open sheets,
 * which is a global that two screens in a stack navigator would then fight
 * over.
 * ---------------------------------------------------------------------------
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  closeAccessibilityLabel,
  children,
  footer,
  maxHeightRatio = SHEET_MAX_HEIGHT_RATIO,
  showClose = true,
  testID,
  style,
  className,
}: SheetProps) {
  const colors = useThemeColors();
  const insets = useSafeInsets();
  const { height: windowHeight } = useWindowDimensions();

  // ==========================================================================
  // `mounted` IS NOT `open`. THIS IS THE WHOLE EXIT ANIMATION.
  //
  // `Modal`'s `visible` is what decides whether the native window exists. Bind
  // it straight to `open` and the window is destroyed on the same frame the
  // close is requested, so the panel VANISHES — the `withTiming` that was
  // going to slide it out is running against a view that is no longer on
  // screen. So `mounted` trails `open`: it goes true immediately, and false
  // only once the exit has had its 220ms.
  // ==========================================================================
  const [mounted, setMounted] = useState(open);

  /** 0 = fully out, 1 = fully in. Drives BOTH the panel and the scrim. */
  const progress = useSharedValue(0);

  /** The panel's own height, measured — the distance it has to travel. */
  const [travel, setTravel] = useState(FALLBACK_TRAVEL);

  // Everything in the panel that is NOT the scrolling body, measured in two
  // parts because they are two boxes: the grabber-plus-header block, and the
  // footer. One `onLayout` shared between them would have each overwrite the
  // other and the body would be budgeted against whichever laid out last.
  const [headerHeight, setHeaderHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);

  const titleRef = useRef<View>(null);

  const enter = useCallback(() => {
    progress.value = withTiming(1, ENTER);
  }, [progress]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    progress.value = withTiming(0, EXIT);
    // ========================================================================
    // A PLAIN `setTimeout`, NOT `withTiming`'s COMPLETION CALLBACK.
    //
    // That callback runs on the UI thread and must therefore be a worklet,
    // which means it depends on the Reanimated/Worklets Babel plugin having
    // run — true in the Expo app, and not something a design-system component
    // should require of every consumer's build. A JS timer of the same
    // duration unmounts the window at the same moment and is deterministic
    // under fake timers, which is what lets the exit be tested at all.
    // ========================================================================
    const timer = setTimeout(() => {
      setMounted(false);
    }, SHEET_EXIT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [open, mounted, progress]);

  // ==========================================================================
  // START THE ANIMATION ONE FRAME AFTER THE WINDOW EXISTS, NOT DURING RENDER.
  //
  // Reanimated inside a `Modal` on iOS drops the first frame when the shared
  // value is written in the same tick the modal mounts: the animation's start
  // value is committed to a view hierarchy the presentation controller has not
  // finished attaching, and the panel appears already in place. `onShow` is
  // the native "the window is up" callback and is the correct trigger — but it
  // never fires under test and is unreliable on Android when a modal is
  // re-shown, so a `requestAnimationFrame` runs the same code one frame later
  // as the belt to `onShow`'s braces. Writing the same target twice is a
  // no-op; `withTiming` to a value already being animated to just continues.
  // ==========================================================================
  useEffect(() => {
    if (!mounted || !open) return;
    const frame = requestAnimationFrame(enter);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [mounted, open, enter]);

  // ==========================================================================
  // MOVE VOICEOVER INTO THE SHEET.
  //
  // iOS does not move accessibility focus into a `Modal` presented this way —
  // focus stays on whatever was behind it, so a screen-reader user taps
  // "filters", hears nothing change, and is still on the class list. Pushing
  // focus to the title is the platform's own remedy.
  //
  // `accessibilityViewIsModal` on the panel is the other half: it tells iOS
  // that everything outside this subtree is inert, so the swipe gesture cannot
  // wander back onto the screen underneath.
  //
  // NATIVE ONLY. `findNodeHandle` THROWS on react-native-web — "not supported
  // on web. Use the ref property on the component instead" — and it throws
  // inside a `requestAnimationFrame`, i.e. outside any error boundary, so every
  // sheet opened in the Expo web preview raises an uncaught error over the page
  // somebody is trying to look at. There is nothing to do there instead: a
  // browser moves focus into a dialog itself, which is the whole reason this
  // effect exists on iOS and nowhere else.
  // ==========================================================================
  useEffect(() => {
    if (!mounted || !open || Platform.OS === 'web') return;
    const frame = requestAnimationFrame(() => {
      const node = titleRef.current ? findNodeHandle(titleRef.current) : null;
      if (node != null) AccessibilityInfo.setAccessibilityFocus(node);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [mounted, open]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * travel }],
  }));

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const onPanelLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0) setTravel(height);
  }, []);

  const onHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    // Sub-pixel churn on rotation or a font-scale change would otherwise
    // re-render on every layout pass forever.
    setHeaderHeight((current) => (Math.abs(next - current) < 1 ? current : next));
  }, []);

  const onFooterLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    setFooterHeight((current) => (Math.abs(next - current) < 1 ? current : next));
  }, []);

  if (!mounted) return null;

  const bottomPad = sheetBottomPad(insets.bottom);

  // The panel's own padding counts too: it is height the body cannot have.
  const chromeHeight =
    PANEL_PAD_TOP + headerHeight + bottomPad + (footer ? FOOTER_GAP + footerHeight : 0);

  const bodyMaxHeight = sheetBodyMaxHeight({ windowHeight, chromeHeight, maxHeightRatio });

  const panel = (
    <Animated.View
      testID={testID}
      onLayout={onPanelLayout}
      // Everything behind this subtree is inert. See the focus note above.
      accessibilityViewIsModal
      style={[
        {
          backgroundColor: colors.backgroundSurface,
          borderTopLeftRadius: clampRadiusTo(SHEET_RADIUS),
          borderTopRightRadius: clampRadiusTo(SHEET_RADIUS),
          paddingHorizontal: PANEL_GUTTER,
          paddingTop: PANEL_PAD_TOP,
          // `pb-8` is 32 points of BROWSER padding, not a safe area. See
          // `sheetBottomPad` for the three-device table.
          paddingBottom: bottomPad,
        },
        panelStyle,
        style,
      ]}
      className={className}
    >
      {/* The chrome — grabber, header and footer — is measured as one block so
          the body knows what is left. `onLayout` on a fragment is impossible,
          so the header carries it and the footer adds its own below. */}
      <View onLayout={onHeaderLayout}>
        {/* THE GRABBER IS SILENT. Drag-to-dismiss is out of scope for v1, and
            a handle that announces itself as draggable is a promise the sheet
            does not keep. */}
        <View
          {...DECORATIVE}
          testID={testID ? `${testID}-grabber` : undefined}
          style={{
            width: SHEET_GRABBER_WIDTH,
            height: SHEET_GRABBER_HEIGHT,
            borderRadius: clampRadiusTo('full', SHEET_GRABBER_HEIGHT),
            alignSelf: 'center',
            marginBottom: GRABBER_GAP,
            backgroundColor: colors.borderEmphasized,
          }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] }}>
          <View
            ref={titleRef}
            accessible
            accessibilityRole="header"
            style={{ flex: 1, minWidth: 0 }}
          >
            <Text variant="subheading" accessible={false}>
              {title}
            </Text>
            {subtitle ? (
              <Text
                variant="bodySmall"
                color="textSecondary"
                accessible={false}
                style={{ marginTop: spacing[1.5] }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          {showClose ? (
            <IconButton
              icon="x"
              accessibilityLabel={closeAccessibilityLabel}
              onPress={onClose}
              variant="quiet"
              size={SHEET_CLOSE_SIZE}
              testID={testID ? `${testID}-close` : undefined}
            />
          ) : null}
        </View>
      </View>

      {children ? (
        <ScrollView
          testID={testID ? `${testID}-body` : undefined}
          // A cap of 0 means the chrome already fills the budget; leaving the
          // body unconstrained there shows the problem rather than hiding it.
          style={bodyMaxHeight > 0 ? { maxHeight: bodyMaxHeight } : undefined}
          contentContainerStyle={{ paddingTop: spacing[5] }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          // The sheet is short by design; bouncing past the top of a 300pt
          // panel reveals the scrim through the gap.
          bounces={false}
        >
          {children}
        </ScrollView>
      ) : null}

      {footer ? (
        // OUTSIDE the ScrollView, and measured into the chrome, so the CTA is
        // always on screen no matter how long the body gets.
        //
        // `flexWrap: 'wrap'` IS THE STACKING RULE, and it costs nothing to the
        // sheets that do not need it. Buttons sized with `flexBasis: 0` (the
        // two-equal-halves rails) have a hypothetical size of zero and can
        // never wrap; buttons sized with `flexBasis: 'auto'` (`ConfirmSheet`)
        // carry their real label width into the line-breaking decision, so a
        // pair that does not fit stacks instead of truncating. That is the one
        // form of "fit or stack" React Native can express without measuring,
        // and the measurement it would otherwise need is a frame late.
        //
        // `onLayout` is what keeps the two-line case honest: the chrome budget
        // is measured, not assumed, so a wrapped footer shrinks the body.
        <View
          testID={testID ? `${testID}-footer` : undefined}
          onLayout={onFooterLayout}
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: spacing[2],
            marginTop: FOOTER_GAP,
          }}
        >
          {footer}
        </View>
      ) : null}
    </Animated.View>
  );

  return (
    <Modal
      visible={mounted}
      transparent
      // The panel's own Reanimated timing IS the animation. RN's slide would
      // run a second, differently-timed one over the top of it.
      animationType="none"
      // Android's hardware back. Without this the back press pops the route.
      onRequestClose={onClose}
      onShow={enter}
      // Lets the scrim reach under the status bar, which `inset-0` requires.
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={StyleSheet.absoluteFill}>
        {/* ================================================================
            THE SCRIM IS FIRST, AND THE PANEL SITS OVER IT.
            A full-bleed scrim rendered ABOVE the panel — which is what the
            artboards' source reads like, since a browser resolves it with
            `z-20` — eats every touch the panel was supposed to get: the CTA
            stops working and the only thing that responds is "close".
            ================================================================ */}
        <Pressable
          testID={testID ? `${testID}-scrim` : undefined}
          accessibilityRole="button"
          accessibilityLabel={closeAccessibilityLabel}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        >
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }, scrimStyle]}
          />
        </Pressable>

        {/* ================================================================
            KEYBOARD: `KeyboardAvoidingView` ON iOS ONLY.
            Android already resizes the window under the keyboard
            (`adjustResize`), so a KAV there makes the layout pay twice and
            leaves a keyboard-sized band of empty canvas above the keyboard.
            `Screen` makes the identical split for the identical reason.
            `pointerEvents="box-none"` so the dock itself does not swallow the
            scrim taps that land beside the panel.
            ================================================================ */}
        {Platform.OS === 'ios' ? (
          <KeyboardAvoidingView behavior="padding" style={DOCK} pointerEvents="box-none">
            {panel}
          </KeyboardAvoidingView>
        ) : (
          <View style={DOCK} pointerEvents="box-none">
            {panel}
          </View>
        )}
      </View>
    </Modal>
  );
}

/** Bottom-anchored, full width. The panel's height is its content's. */
const DOCK: ViewStyle = { position: 'absolute', left: 0, right: 0, bottom: 0 };
