import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { clampRadiusTo } from '../internal/clamp-radius';
import { DECORATIVE, interactiveA11y } from '../internal/a11y';
import { usePressed } from '../internal/use-pressed';
import { Icon } from '../primitives/icon/icon';
import { Money, Mono, Text } from '../primitives/text';
import type { MonoVariant } from '../primitives/text';
import type { ColorRole } from '../tokens/semantic';
import { spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

// ===========================================================================
// A PRODUCT, IN A ROW. THREE LAYOUTS, THREE PLACES.
//
//   compact     mobile-home-v2.tsx:475   the home "შენი ვარჯიშისთვის" rail
//               rounded-[22px] bg-ink-900 px-4 py-3.5, no thumbnail,
//               mono 13/700 lime price on the right, then a 16pt chevron
//
//   catalogue   mobile-shop.tsx:158      the shop list
//               rounded-[26px] bg-ink-900 p-4, gap-4,
//               72×72 rounded-[22px] bg-ink-800 monogram thumb (mono 30 @ 80%),
//               mono 15/700 lime price under the meta line
//
//   line        mobile-shop.tsx:305      a cart line inside the sheet
//               NO shell at all, gap-3,
//               56×56 rounded-[18px] thumb (mono 22 @ 80%),
//               mono 12/400 ink-400 unit price
//
// ---------------------------------------------------------------------------
// THERE IS NEVER A PHOTO. The design draws a MONOGRAM on an `ink-800` plate —
// one bold mono initial at 80% opacity — in both places a product image could
// have gone. That is a deliberate art-direction choice (a catalogue of mixed
// supplier photography is the fastest way to make a flat, monochrome direction
// look like a marketplace), so this component has no `source` prop at all.
//
// THE PRICE ARRIVES FORMATTED, INCLUDING THE "FROM". The artboards render
// `${money(minor)}-დან` when a product has more than one variant. Both halves
// of that are app knowledge — the minor-unit convention, the locale's decimal
// separator, and the word "from" — so this component takes ONE string and sets
// it. It deliberately has no `variantCount` prop: given one it would have to
// compose the copy, which is the line this package does not cross.
//
// `priceAccessibilityLabel` is required for the same reason `Money` requires
// one: VoiceOver reads a tabular monospace run character by character, so
// "89,00 ₾" becomes "eight nine comma zero zero" — on the one number a member
// will ask to have read back before spending money.
//
// THE PRESSABLE REGION DEPENDS ON `trailing`. With no trailing control the
// WHOLE row is the button (which is what the home rail is). With one — the
// shop's qty stepper, the cart's stepper and bin — only the leading region is,
// because a button nested inside a button gives a screen-reader user two stops
// that do different things and no way to tell them apart.
// ---------------------------------------------------------------------------
// ===========================================================================

export type ProductRowLayout = 'compact' | 'catalogue' | 'line';

interface LayoutSpec {
  /** `null` = no fill, no radius, no padding: the cart line. */
  shell: { radius: number; padH: 3 | 4; padV: 3.5 | 4 } | null;
  gap: 3 | 4;
  /** `null` = no monogram plate. */
  thumb: { size: number; radius: number; mono: number } | null;
  /** Where the price sits, and how it is set. */
  price: {
    placement: 'inline' | 'below';
    variant: MonoVariant;
    color: ColorRole;
  };
  /** The home rail is the only layout that draws one. */
  chevron: boolean;
}

const LAYOUTS = {
  compact: {
    shell: { radius: 22, padH: 4, padV: 3.5 },
    gap: 3,
    thumb: null,
    price: { placement: 'inline', variant: 'monoSmall', color: 'textAccent' },
    chevron: true,
  },
  catalogue: {
    shell: { radius: 26, padH: 4, padV: 4 },
    gap: 4,
    thumb: { size: 72, radius: 22, mono: 30 },
    price: { placement: 'below', variant: 'monoBody', color: 'textAccent' },
    chevron: false,
  },
  line: {
    shell: null,
    gap: 3,
    thumb: { size: 56, radius: 18, mono: 22 },
    // The cart already shows the LINE total beside the stepper; this figure is
    // the per-unit price, which the artboard sets as quiet mono caption rather
    // than as the lime the catalogue uses to sell.
    price: { placement: 'below', variant: 'monoCaption', color: 'textSecondary' },
    chevron: false,
  },
} as const satisfies Record<ProductRowLayout, LayoutSpec>;

/** `h-4` — the compact layout's chevron. */
const CHEVRON = 16;

/** The monogram's opacity. `opacity-80` on both artboard thumbnails. */
const MONOGRAM_OPACITY = 0.8;

/**
 * `leading-none` on a numeral-or-initial run, at a size the mono ladder folded
 * away. Same trade, and same reasoning, as `StatTile`: the face, the tracking
 * and the tabular figures still come from the role.
 */
function monoSize(size: number): TextStyle {
  return { fontSize: size, lineHeight: size };
}

export interface ProductRowProps {
  /** The product name. Required — copy is always the caller's. */
  name: string;

  /**
   * The price, ALREADY FORMATTED, including any "from" prefix or suffix.
   * See the header for why this is a string and not an amount.
   */
  price: string;

  /**
   * REQUIRED. The spoken form of {@link price} — "from 89 lari", not
   * "eight nine comma zero zero lari sign".
   */
  priceAccessibilityLabel: string;

  /** Default `'compact'`. */
  layout?: ProductRowLayout;

  /** One truncating line under the name — "2 ვარიანტი · მარაგში 3". */
  meta?: string;

  /**
   * The monogram drawn on the thumbnail plate. Passed rather than derived:
   * taking an initial is locale-specific and this package does not know the
   * locale. Ignored by the `compact` layout, which draws no plate.
   */
  initial?: string;

  onPress?: () => void;

  /**
   * The control on the right: a `QtyStepper`, an add `IconButton`, a bin.
   * See the header — supplying one narrows the pressable region.
   *
   * Whatever goes here announces itself, so it needs its own
   * `accessibilityLabel`; it is NOT inside this row's labelled region.
   */
  trailing?: ReactNode;

  disabled?: boolean;

  /**
   * Overrides the spoken name of the pressable region, which defaults to the
   * name, the meta line and the spoken price, joined. All three are strings the
   * caller already supplied.
   */
  accessibilityLabel?: string;

  /** Forwarded to the root node. */
  testID?: string;

  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/** A product in the shop, on the home rail, or in the cart. */
export function ProductRow({
  name,
  price,
  priceAccessibilityLabel,
  layout = 'compact',
  meta,
  initial,
  onPress,
  trailing,
  disabled = false,
  accessibilityLabel,
  testID,
  style,
  className,
}: ProductRowProps) {
  const colors = useThemeColors();
  const { pressed, onPressIn, onPressOut } = usePressed();
  const spec: LayoutSpec = LAYOUTS[layout];

  const pressable = onPress !== undefined && !disabled;
  const wholeRow = pressable && trailing === undefined;

  const spoken =
    accessibilityLabel ?? [name, meta, priceAccessibilityLabel].filter(Boolean).join(', ');

  // Inside a pressable region the BUTTON is the accessibility node, so its text
  // has to leave the tree. `accessible={false}` alone is not enough on Android
  // — `DECORATIVE` sets all three flags. A row with no `onPress` is not a
  // control, so its name, meta and price announce themselves instead.
  const inner = pressable ? DECORATIVE : {};

  const priceNode = (
    <Money
      variant={spec.price.variant}
      color={disabled ? 'textDisabled' : spec.price.color}
      accessibilityLabel={priceAccessibilityLabel}
      {...inner}
      numberOfLines={1}
      style={spec.price.placement === 'below' ? { marginTop: spacing[2] } : null}
    >
      {price}
    </Money>
  );

  const leading = (
    <>
      {/*
        The plate is part of the LAYOUT and the monogram is its content, so a
        product with no initial still reserves its 72 (or 56) points. Dropping
        the plate would reflow the whole row against its neighbours in the
        list, which is worse than an empty square.
      */}
      {spec.thumb ? (
        <View
          {...DECORATIVE}
          style={{
            width: spec.thumb.size,
            height: spec.thumb.size,
            borderRadius: clampRadiusTo(spec.thumb.radius, spec.thumb.size),
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.quiet,
          }}
        >
          {initial === undefined ? null : (
            <Mono
              variant="monoDisplay"
              color="onQuiet"
              {...DECORATIVE}
              style={[monoSize(spec.thumb.mono), { opacity: MONOGRAM_OPACITY }]}
            >
              {initial}
            </Mono>
          )}
        </View>
      ) : null}

      <View {...inner} style={{ flex: 1, minWidth: 0 }}>
        <Text color={disabled ? 'textDisabled' : 'textPrimary'} numberOfLines={2}>
          {name}
        </Text>
        {meta ? (
          <Text
            variant="caption"
            color={disabled ? 'textDisabled' : 'textSecondary'}
            numberOfLines={1}
            style={{ marginTop: spacing[1] }}
          >
            {meta}
          </Text>
        ) : null}
        {spec.price.placement === 'below' ? priceNode : null}
      </View>

      {spec.price.placement === 'inline' ? priceNode : null}

      {spec.chevron ? (
        <Icon name="chevronRight" color={colors.iconDisabled} size={CHEVRON} />
      ) : null}
    </>
  );

  const rowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[spec.gap],
    // The shell's own floor. `line` has no padding, so its floor comes from the
    // 56pt thumb; the two shelled layouts clear 44 on padding alone.
    minHeight: 44,
    ...(spec.shell
      ? {
          backgroundColor: colors.backgroundCard,
          borderRadius: clampRadiusTo(spec.shell.radius),
          paddingHorizontal: spacing[spec.shell.padH],
          paddingVertical: spacing[spec.shell.padV],
        }
      : null),
  };

  // Whole-row button: the home rail. Nothing else is on the row to compete.
  if (wholeRow) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        {...interactiveA11y({ accessibilityLabel: spoken }, { disabled })}
        style={[rowStyle, pressed ? { backgroundColor: colors.tilePressed } : null, style]}
        className={className}
      >
        {leading}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={[rowStyle, style]} className={className}>
      {pressable ? (
        <Pressable
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={disabled}
          {...interactiveA11y({ accessibilityLabel: spoken }, { disabled })}
          style={[
            {
              flex: 1,
              minWidth: 0,
              minHeight: 44,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing[spec.gap],
            },
            // A shell-less row has no plate to step, so the pressed state is
            // painted on the leading region itself, at the `inner` rung.
            pressed
              ? {
                  backgroundColor: colors.tilePressed,
                  borderRadius: clampRadiusTo(spec.shell ? spec.shell.radius : 'inner'),
                }
              : null,
          ]}
        >
          {leading}
        </Pressable>
      ) : (
        leading
      )}
      {trailing}
    </View>
  );
}
