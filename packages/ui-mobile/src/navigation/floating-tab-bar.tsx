import { useContext, useEffect, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';

import { interactiveA11y } from '../internal/a11y';
import { hitSlopFor } from '../internal/hit-slop';
import { usePressed } from '../internal/use-pressed';
import { CountBadge, DotBadge, type BadgeSpec } from '../feedback/pill';
import { Icon } from '../primitives/icon/icon';
import type { IconName } from '../primitives/icon/paths';
import { layout } from '../tokens/spacing';
import { shadowsFor } from '../tokens/shadows';
import { useTheme, useThemeColors } from '../tokens/theme';
import {
  SCREEN_GUTTER,
  capsuleMetricsFor,
  tabBarBottomOffset,
  tabBarInset,
} from '../layout/metrics';

// ===========================================================================
// THE FLOATING CAPSULE. FIVE ARTBOARDS TO ONE.
//
// `design-system.tsx:600` draws a raised-FAB bottom bar — a full-width bar
// flush to the edge with the centre action lifted out of it. All five mobile
// artboards that show navigation draw the same thing instead: a capsule,
// `rounded-pill bg-ink-900 p-2`, floating 24 above the edge inside the page
// gutters, with equal 56pt round items and the active one filled lime. The
// artboards win, and by a margin that is not really a judgement call.
//
// THE ITEM COUNT IS THE CALLER'S. The artboards drew five; `apps/mobile` ships
// four since the QR centre action was removed (2026-08-31). Nothing in this
// file counts items — `capsuleMetricsFor(width, items.length)` sizes the row,
// `justify-content: space-between` places it — so the capsule is correct at
// either count without a change here.
//
// HOW IT IS MOUNTED. Once, via expo-router's `tabBar` prop — never per screen.
// The previous app's second tab bar came from exactly that: a local kit grew a
// tab bar, the shared one stayed, and the repo shipped two. But this component
// CANNOT import `expo-router` (the package/app line, enforced by eslint), so
// it takes `items`, `activeKey` and `onSelect` as props and the app wires them
// to the navigator. That is also what makes it testable without a navigator.
// ===========================================================================

/** Zero, for a tree with no `SafeAreaProvider` above it. */
const NO_INSETS: EdgeInsets = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * The safe-area insets, or zeros.
 *
 * READS THE CONTEXT DIRECTLY RATHER THAN CALLING `useSafeAreaInsets`, which
 * THROWS when there is no provider. A design-system component that takes the
 * whole screen down because it was rendered in a test, a detached modal or a
 * Storybook-style kit route is a component people stop using. The app's root
 * layout has the provider; everything else degrades to the artboards' own
 * no-inset geometry, which is exactly right for the devices that report zero.
 */
export function useSafeInsets(): EdgeInsets {
  return useContext(SafeAreaInsetsContext) ?? NO_INSETS;
}

/**
 * The bottom padding a scrolling screen needs so its last row clears the
 * capsule. **128 at inset 0** — see `../layout/metrics.ts` for the
 * decomposition and for why it is deliberately not width-aware.
 *
 * `Screen` calls this. A screen that scrolls outside `Screen` should call it
 * too, and must never hardcode 128: the constant is 24 + 72 + 32, and two of
 * those three move with the device.
 */
export function useTabBarInset(): number {
  return tabBarInset(useSafeInsets().bottom);
}

/**
 * True while the software keyboard is up.
 *
 * `will*` on iOS and `did*` on Android is not a stylistic choice: Android does
 * not emit the `will` events at all, and iOS's `will` events fire at the start
 * of the show animation, so the capsule leaves at the same moment the keyboard
 * arrives instead of a frame after it.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => {
      setVisible(true);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      setVisible(false);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}

export interface TabItem<K extends string = string> {
  key: K;
  icon: IconName;
  /**
   * REQUIRED. The items are ICON-ONLY — there is not a word of text in the
   * capsule on any artboard — so without this the entire navigation of the app
   * is unreachable with a screen reader. Typed as a plain `string` so omitting
   * it fails `type-check` rather than VoiceOver.
   */
  accessibilityLabel: string;
  /**
   * This item does not navigate: the bar calls `onSelect` and THE CALLER
   * decides what happens.
   *
   * The centre QR slot was the case: on every artboard it opened a sheet over
   * the current tab rather than switching tabs (`mobile-home-v2.tsx:216` —
   * `t.key === 'qr' ? setQrOpen(true) : setTab(t.key)`). That slot is gone
   * (2026-08-31, with the QR screen), so this flag currently has NO CONSUMER
   * in `apps/mobile`. It is kept because the alternative — encoding "sheet"
   * here — would put a routing decision inside a design component, and
   * encoding nothing would make the caller re-derive it from a key it also
   * chose. The flag rides on the item and comes back through `onSelect`.
   */
  intercept?: boolean;
  /** A count or a dot on the corner — the cart's badge, if Shop ever wants it. */
  badge?: BadgeSpec;
}

export interface FloatingTabBarProps<K extends string = string> {
  items: readonly TabItem<K>[];
  activeKey: K;
  /**
   * Called for EVERY item, including intercepting ones. The second argument is
   * the item itself, so a caller can branch on `item.intercept` without
   * looking the key up again.
   */
  onSelect: (key: K, item: TabItem<K>) => void;
  /** The accessible name of the tab list as a whole. Required — rule 1. */
  accessibilityLabel: string;
  /**
   * Keep the bar mounted while the keyboard is up. Default `false`, and the
   * default is the right one — see the note in the component.
   */
  keepVisibleWithKeyboard?: boolean;
  /** Forwarded to the root; each item takes `${testID}-${item.key}`. */
  testID?: string;
  /** Merged last, so the app can reposition it. */
  style?: StyleProp<ViewStyle>;
  /** Merged last. */
  className?: string;
}

interface TabProps<K extends string> {
  item: TabItem<K>;
  active: boolean;
  size: number;
  glyph: number;
  onPress: () => void;
  testID?: string;
}

function Tab<K extends string>({ item, active, size, glyph, onPress, testID }: TabProps<K>) {
  const colors = useThemeColors();
  const { pressed, onPressIn, onPressOut } = usePressed();

  const foreground = active
    ? colors.onAccent
    : pressed
      ? colors.textPrimary
      : // The artboards' idle glyph is `text-ink-500`. There is no semantic
        // role at ink-500; `iconSecondary` is ink-400 — one stop brighter, and
        // the closest role that means "an icon that is not the primary one".
        // Reaching for `ink[500]` off the palette would be a ramp stop in a
        // component, which is the thing the semantic layer exists to prevent.
        colors.iconSecondary;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      // 56 (or 52 on a small device) — both over the floor, so this is
      // `{0,0,0,0}`. Applied anyway so a future size change cannot silently
      // drop below 44.
      hitSlop={hitSlopFor(size)}
      testID={testID}
      android_ripple={{ color: colors.focusRing, borderless: true, radius: size / 2 }}
      {...interactiveA11y(
        { accessibilityLabel: item.accessibilityLabel, accessibilityRole: 'tab' },
        { selected: active },
      )}
      style={{
        width: size,
        height: size,
        minHeight: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        ...(active ? { backgroundColor: colors.accent } : {}),
      }}
    >
      <Icon name={item.icon} color={foreground} size={glyph} />
      {item.badge ? (
        'dot' in item.badge ? (
          <View style={{ position: 'absolute', top: 10, right: 10 }}>
            {/* Ringed in the capsule's own fill, so the dot stays legible over
                a lime plate as well as over the charcoal one. */}
            <DotBadge ringColor={active ? 'accent' : 'backgroundCard'} />
          </View>
        ) : (
          <View style={{ position: 'absolute', top: 2, right: 2 }}>
            <CountBadge
              count={item.badge.count}
              max={item.badge.max}
              ringColor={active ? 'accent' : 'backgroundCard'}
            />
          </View>
        )
      ) : null}
    </Pressable>
  );
}

/** The product's bottom navigation. */
export function FloatingTabBar<K extends string = string>({
  items,
  activeKey,
  onSelect,
  accessibilityLabel,
  keepVisibleWithKeyboard = false,
  testID,
  style,
  className,
}: FloatingTabBarProps<K>) {
  const { colors, isDark } = useTheme();
  const insets = useSafeInsets();
  const { width } = useWindowDimensions();
  const keyboardVisible = useKeyboardVisible();

  const metrics = capsuleMetricsFor(width, items.length);
  const bottom = tabBarBottomOffset(insets.bottom);

  // ==========================================================================
  // THE THIRD TRAP: the bar goes away while the keyboard is up.
  //
  // No artboard has a keyboard, so nothing in the design says what happens.
  // What happens without this is that a 72pt lime-and-charcoal capsule sits
  // directly on top of the keyboard's accessory bar — over the "Done" button,
  // over the autocomplete strip — and the bottom fifth of the keyboard becomes
  // untappable. It is not a polish issue; it is a form the user cannot finish.
  //
  // Unmounting rather than hiding, because this component holds no state worth
  // preserving across a keyboard and an unmounted subtree cannot intercept a
  // touch by accident.
  // ==========================================================================
  if (keyboardVisible && !keepVisibleWithKeyboard) return null;

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          // Floats OVER the content. Every screen reserves the space with
          // `useTabBarInset()`; nothing reserves it by being in the flow.
          position: 'absolute',
          left: 0,
          right: 0,
          bottom,
          paddingHorizontal: SCREEN_GUTTER,
        },
        style,
      ]}
      className={className}
      // The bar is absolutely positioned over the page, so it would otherwise
      // swallow touches in its padding — the 20pt gutters either side of the
      // capsule, which sit directly over the last row of content.
      pointerEvents="box-none"
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: metrics.padding,
          minHeight: metrics.height,
          // `rounded-pill`. RN clamps to half the shorter side.
          borderRadius: metrics.height / 2,
          // ==================================================================
          // ANDROID NEEDS BOTH OF THE NEXT TWO LINES.
          //
          // `elevation` alone renders NO shadow on a view with no
          // `backgroundColor`: Android derives the shadow from the view's
          // outline, an outline comes from its background drawable, and a
          // transparent view has none. The bug is invisible on iOS, where
          // `shadowOpacity` is enough — so the capsule looks correct on the
          // simulator most of this app is developed on and flat on hardware.
          //
          // AND THE FILL IS `backgroundCard`, NOT `glass`. The token layer's
          // `glass` role is annotated "the floating nav capsule's surface" and
          // is ink-900 at 72% — but all five artboards paint the capsule with
          // an OPAQUE `bg-ink-900`, and the artboards win. It is also the
          // safer of the two on Android: a translucent background yields a
          // correspondingly washed-out elevation shadow, so the one surface
          // that must read as floating would read as the least floating.
          // `glass` stays the right role for a Sheet's chrome in WP-8, where
          // the translucency is the point.
          // ==================================================================
          backgroundColor: colors.backgroundCard,
          ...shadowsFor(isDark).float,
          // The rim light. `shadows.ts` is explicit that a floating surface on
          // a dark page needs it: RN has no inset shadow, and the ambient
          // shadow alone gives a dark capsule on a dark page no edge at all.
          // It adds 1pt per side to the capsule, which the 32pt clearance in
          // `tabBarInset` absorbs.
          borderWidth: layout.hairline,
          borderColor: colors.glassBorder,
        }}
      >
        {items.map((item) => (
          <Tab
            key={item.key}
            item={item}
            active={item.key === activeKey}
            size={metrics.itemSize}
            glyph={item.key === activeKey ? metrics.glyphActive : metrics.glyphIdle}
            onPress={() => {
              onSelect(item.key, item);
            }}
            testID={testID ? `${testID}-${item.key}` : undefined}
          />
        ))}
      </View>
    </View>
  );
}
