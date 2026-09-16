import { useState, type ReactElement, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useSafeInsets, useTabBarInset } from '../navigation/floating-tab-bar';
import { useTheme } from '../tokens/theme';
import type { ColorRole } from '../tokens/semantic';

import {
  CAPSULE_HEIGHT,
  FOOTER_GAP,
  SCREEN_GUTTER,
  headerTopFor,
  tabBarBottomOffset,
} from './metrics';

// ===========================================================================
// THE PAGE FRAME. Gutters, safe areas, the keyboard, and the space the
// floating capsule needs — in one component, because every one of those is a
// thing 28 screens would otherwise each get slightly differently right.
// ===========================================================================

/**
 * `tone="accent"` FLIPS THE WHOLE CANVAS, AND THE STATUS BAR WITH IT.
 *
 * `mobile-qr.tsx:171` is the case: pressing the brightness control repaints
 * the entire screen `bg-brand-300 text-ink-950`, because a QR code scans off a
 * bright screen and the fastest way to raise perceived brightness without
 * touching the OS brightness API is to make the page itself the light source.
 *
 * The status bar has to flip too, and this is the half that gets forgotten:
 * the bar's glyphs are drawn by the OS in whatever style the app last
 * declared, so a screen that turns lime while the status bar is still
 * `light-content` renders white text on `#E4F26A` — about 1.5:1, which is not
 * "hard to read", it is invisible. And it stays invisible after navigating
 * away, because the declaration is global and nothing changed it back.
 */
const TONES = {
  body: { background: 'backgroundBody', bar: 'light' },
  accent: { background: 'accent', bar: 'dark' },
  /** For a screen that is one large card — the auth screens' ink-950 field
   *  ground already IS the body colour, so this is `backgroundSurface`. */
  surface: { background: 'backgroundSurface', bar: 'light' },
} as const satisfies Record<string, { background: ColorRole; bar: 'light' | 'dark' }>;

export type ScreenTone = keyof typeof TONES;

export interface ScreenProps {
  children: ReactNode;

  /**
   * Rendered above the scrolling content, outside it, at
   * `max(insets.top + 12, 56)`.
   *
   * Outside, so it does not scroll away — the artboards' headers are static
   * and every one of them holds a control (a filter, a cart, a back button)
   * that must stay reachable. Pass an `AppBar`.
   */
  header?: ReactNode;

  /** Default `'body'`. `'accent'` is the QR screen's brightness boost. */
  tone?: ScreenTone;

  /**
   * Default `true`. Pass `false` for a screen that manages its own scrolling
   * (a `FlatList` screen), which then owns its own `keyboardShouldPersistTaps`
   * and its own bottom inset — {@link useTabBarInset} is exported for exactly
   * that.
   */
  scroll?: boolean;

  /** Default `true` — the artboards' `px-5` on the content. */
  gutter?: boolean;

  /**
   * Default `true`. Reserve the space the floating capsule covers. Turn it off
   * for a screen with no tab bar under it: a modal, a sheet route, the auth
   * stack.
   */
  reserveTabBar?: boolean;

  /**
   * Default `true` on iOS and inert on Android — see the note in the
   * component. There is no reason to turn it off except for a screen with no
   * input at all, where it costs nothing anyway.
   */
  keyboardAvoiding?: boolean;

  /** Passed straight to the `ScrollView`. */
  refreshControl?: ReactElement<RefreshControlProps>;

  /**
   * Pinned above the tab bar, outside the scroll — the shop's cart bar.
   *
   * ==========================================================================
   * THE FOOTER MUST BRING ITS OWN OPAQUE PLATE. `Screen` PAINTS NOTHING HERE.
   *
   * The wrapper below is `position: absolute` over the scroll view, so anything
   * transparent inside it draws the scrolling content THROUGH the footer. The
   * cart shipped exactly that: at rest "1 კალათაში" and "აირჩიე აღების
   * ლოკაცია" sat glyph-on-glyph and the reassurance line bled through the
   * button band.
   *
   * The alternative — `Screen` painting a plate for every footer — was
   * considered and rejected, because `Screen` cannot tell the two legitimate
   * cases apart:
   *
   *   · the footer IS already a plate (`classes/[id]`'s `BookingBar` is a
   *     `Surface tone="card"`), and a second one behind it is a double card;
   *   · the footer is a single opaque control (`shop/index`'s full-width lime
   *     mini-cart `Button`, `shop/order/[orderId]`'s continue, the join
   *     success screen's home button), and a plate behind THAT rings the lime
   *     pill with a dark rectangle the artboards never draw.
   *
   * So the rule is at the call site, where the answer is knowable: a footer
   * whose own root is not opaque — a `View` stacking a note, a button and a
   * caption — wraps itself in `Surface tone="card"`. A footer that is a single
   * filled control, or already a `Surface`, passes as-is.
   * ==========================================================================
   */
  footer?: ReactNode;

  /** Merged last onto the scroll view's content container. */
  contentContainerStyle?: StyleProp<ViewStyle>;

  /** Forwarded to the root node. */
  testID?: string;

  /** Merged last onto the root. */
  style?: StyleProp<ViewStyle>;

  /** Merged last onto the root. */
  className?: string;
}

/**
 * A screen.
 *
 * Three things it does that a screen should never do for itself:
 *
 *   1. the top inset, which is a floor rather than a value (see
 *      `headerTopFor`);
 *   2. the bottom clearance, which is {@link useTabBarInset} and NEVER a
 *      hardcoded 128 — the artboards' `pb-32` is only correct on a phone with
 *      no home indicator;
 *   3. the keyboard, which has no comp at all and three separate traps in it.
 */
export function Screen({
  children,
  header,
  tone = 'body',
  scroll = true,
  gutter = true,
  reserveTabBar = true,
  keyboardAvoiding = true,
  refreshControl,
  footer,
  contentContainerStyle,
  testID,
  style,
  className,
}: ScreenProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeInsets();
  const tabBarInset = useTabBarInset();

  // The footer is measured rather than assumed, because its height is the
  // caller's: the shop's cart bar is one `lg` button, a checkout bar is two.
  // Without this the last row of the list hides behind it.
  const [footerHeight, setFooterHeight] = useState(0);

  // WHERE THE FOOTER SITS, AND WHY IT IS NOT JUST `bottom: 0`.
  //
  // The nav is a FLOATING capsule, not a bar docked to the edge — so a footer
  // pinned to the bottom slides *under* it and loses its last rows to the
  // capsule's shadow. It belongs directly above: the capsule's own offset from
  // the edge, plus the capsule, plus a gap. At inset 0 that is 24 + 72 + 12 =
  // 108, which is exactly the `bottom-[108px]` every shop artboard draws.
  const footerBottom = reserveTabBar
    ? tabBarBottomOffset(insets.bottom) + CAPSULE_HEIGHT + FOOTER_GAP
    : Math.max(insets.bottom, FOOTER_GAP);

  const spec = TONES[tone];
  const background = colors[spec.background];

  // The canvas is dark in v1 (decision Q5), so `body` wants light glyphs; the
  // lime canvas wants dark ones in both modes, because the lime does not
  // change between them. Deriving the `body` case from `isDark` rather than
  // hardcoding it is what makes the eventual light mode a swap.
  const barStyle: 'light-content' | 'dark-content' =
    spec.bar === 'dark' || !isDark ? 'dark-content' : 'light-content';

  const content = (
    <>
      {header ? (
        <View
          testID={testID ? `${testID}-header` : undefined}
          style={{
            // A FLOOR under the inset, not a value. `pt-14` = 56 on every
            // artboard is correct for a browser canvas with no status bar; on
            // a Dynamic Island phone (inset 59) a hard 56 draws the title
            // under the island.
            paddingTop: headerTopFor(insets.top),
            ...(gutter ? { paddingHorizontal: SCREEN_GUTTER } : {}),
          }}
        >
          {header}
        </View>
      ) : null}

      {scroll ? (
        <ScrollView
          // ==================================================================
          // WITHOUT THIS, THE FIRST TAP AFTER TYPING DOES NOTHING.
          //
          // A `ScrollView`'s default is `keyboardShouldPersistTaps="never"`:
          // while the keyboard is up, a touch inside the scroll view is
          // consumed by dismissing it, and the button under the finger never
          // fires. The user presses "Sign in", the keyboard closes, nothing
          // happens, and they press it again — which is indistinguishable from
          // a slow network and reads as the app being broken.
          //
          // `"handled"` keeps the dismissal for taps that hit nothing and lets
          // taps that land on a control through on the first press.
          // ==================================================================
          keyboardShouldPersistTaps="handled"
          // The scroll view gets its own selector. A Maestro flow that has to
          // scroll a screen needs a handle on the scroller rather than on the
          // frame around it, and a render test needs one to read the reserve
          // this component's whole bottom half exists to compute.
          testID={testID ? `${testID}-scroll` : undefined}
          // No scroll indicator anywhere in the six artboards.
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          contentContainerStyle={[
            {
              ...(gutter ? { paddingHorizontal: SCREEN_GUTTER } : {}),
              // NEVER a hardcoded 128 — see `useTabBarInset`.
              // Only emitted when there is something to reserve — a bare `0`
              // would be a no-op key in every screen's style object.
              ...(reserveTabBar || footerHeight > 0
                ? { paddingBottom: (reserveTabBar ? tabBarInset : 0) + footerHeight }
                : {}),
              flexGrow: 1,
            },
            contentContainerStyle,
          ]}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          testID={testID ? `${testID}-content` : undefined}
          style={{
            flex: 1,
            ...(gutter ? { paddingHorizontal: SCREEN_GUTTER } : {}),
            ...(reserveTabBar || footerHeight > 0
              ? { paddingBottom: (reserveTabBar ? tabBarInset : 0) + footerHeight }
              : {}),
          }}
        >
          {children}
        </View>
      )}

      {footer === undefined ? null : (
        <View
          testID={testID ? `${testID}-footer` : undefined}
          pointerEvents="box-none"
          onLayout={(event) => {
            setFooterHeight(event.nativeEvent.layout.height);
          }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: footerBottom,
            ...(gutter ? { paddingHorizontal: SCREEN_GUTTER } : {}),
          }}
        >
          {footer}
        </View>
      )}
    </>
  );

  // ==========================================================================
  // A SCREEN WITH NO HEADER STILL HAS A STATUS BAR ABOVE IT.
  //
  // `headerTopFor(insets.top)` is applied to the `header` slot, and only there
  // — which is correct for the twenty-seven screens that have one and wrong for
  // the one that does not. `app/onboarding.tsx` passes no header, so its first
  // row started at y=0 and its Skip button was drawn INSIDE the status bar,
  // glyphs touching the Wi-Fi and battery icons, on every notched device.
  //
  // The inset goes on the ROOT rather than into `contentContainerStyle`,
  // deliberately: the content container is merged with the caller's own
  // `contentContainerStyle`, and a `paddingTop` we inject there would silently
  // outrank a caller's `paddingVertical` under Yoga's edge-beats-axis rule —
  // a fight nobody would find. On the root it composes instead of competing.
  //
  // `insets.top`, NOT `headerTopFor`: the 56pt floor is a HEADER's budget, the
  // room a title block needs. A headerless screen owes the status bar exactly
  // the status bar, and whatever padding it wants on top of that is its own.
  // ==========================================================================
  const rootStyle: StyleProp<ViewStyle> = [
    {
      flex: 1,
      backgroundColor: background,
      ...(header === undefined ? { paddingTop: insets.top } : {}),
    },
    style,
  ];

  // ==========================================================================
  // `KeyboardAvoidingView` ON iOS ONLY.
  //
  // Android already resizes the window under a keyboard (`adjustResize`, which
  // is what Expo sets), so wrapping in a `KeyboardAvoidingView` there makes
  // the layout pay for the keyboard TWICE: the window shrinks by the
  // keyboard's height and the view then adds the same height as padding,
  // leaving a keyboard-sized band of empty canvas above the keyboard. It is
  // the single most common React Native form bug and it looks like a styling
  // mistake rather than a double-count.
  //
  // `behavior="padding"` rather than `"height"`: `"height"` sets a fixed
  // height on the container, which fights `flex: 1` and makes the content jump
  // rather than slide.
  // ==========================================================================
  if (keyboardAvoiding && Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView
        testID={testID}
        behavior="padding"
        style={rootStyle}
        className={className}
      >
        <StatusBar barStyle={barStyle} animated />
        {content}
      </KeyboardAvoidingView>
    );
  }

  return (
    <View testID={testID} style={rootStyle} className={className}>
      <StatusBar barStyle={barStyle} animated />
      {content}
    </View>
  );
}
