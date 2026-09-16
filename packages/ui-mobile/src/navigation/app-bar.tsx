import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Eyebrow, Heading, Text } from '../primitives/text';
import { spacing } from '../tokens/spacing';
import { headerTopFor, SCREEN_GUTTER } from '../layout/metrics';

import { useSafeInsets } from './floating-tab-bar';

// ===========================================================================
// THE SCREEN HEADER. Six artboards, six headers, one silhouette:
//
//   home           avatar · greeting + plan line          · bell
//   classes        eyebrow + "გაკვეთილები"                 · filter
//   class detail   back                                    · share
//   shop           "მაღაზია" + one line of copy            · cart
//   qr             "ჩექ-ინი" + one line of copy            · brightness
//   profile        (the profile card itself is the header)
//
// A leading slot, a title block, a trailing slot; `px-5`, `pt-14`, `pb-5` or
// `pb-6`. The title is 28px extrabold — the `title` role — on four of the five
// that have one, which is why `Heading` is given an explicit `variant` here:
// its `level={2}` default is 24, the CARD-title size, and a screen title and a
// card title are not the same size in this design.
// ===========================================================================

export type AppBarAlign = 'top' | 'center';

export interface AppBarProps {
  /** The screen title. Announced as a header — one per screen. */
  title?: string;

  /**
   * The title's type step. Defaults to `'title'` (28), which is what the
   * classes, shop, profile and settings artboards draw.
   *
   * Home is the exception and needs `'section'` (20): its title is a
   * greeting — a phrase, not a noun — and at 28 a two-word Georgian greeting
   * truncates to "კეთილი დაბრ…" beside the avatar and the bell.
   * `mobile-home-v2.tsx:207` draws it at `text-[20px]` for exactly that reason.
   */
  titleVariant?: 'title' | 'section';

  /**
   * How many lines the title may take. Default **2**.
   *
   * ==========================================================================
   * IT WAS 1, AND 28px EXTRABOLD IS NOT A ONE-LINE SIZE IN GEORGIAN.
   *
   * The join funnel's step 4 shipped "გადახედვა და გად…" — the screen's own
   * name, cut, in the header that is also its one `role="header"`. Nothing
   * about the design asks for a single line; the artboards simply never drew
   * a title long enough to need a second one, and `numberOfLines={1}` was
   * transcribed from that absence rather than from a rule.
   *
   * Two lines is the right default because a truncated screen title is a
   * strictly worse failure than a taller header: the header grows only for the
   * titles that would otherwise have been cut, and shrinks back on every
   * screen and locale where one line was always enough. `titleVariant`
   * ('section', 20) remains the answer where the *design* wants a smaller
   * title — home's greeting — rather than a bigger box.
   *
   * Pass `1` only where a second line would break a fixed-height chrome.
   * ==========================================================================
   */
  titleLines?: number;

  /** A small-caps kicker above the title — the classes screen's "აგვისტო 2026". */
  eyebrow?: string;

  /** One line under the title. Both the shop and the QR screen have one. */
  subtitle?: string;

  /**
   * The left slot: a back `IconButton`, an `Avatar`. Rendered before the title
   * block.
   */
  leading?: ReactNode;

  /** The right slot: an `IconButton`, usually with a badge. */
  trailing?: ReactNode;

  /**
   * Replaces the title block entirely — for a header that is a search field or
   * a segmented control rather than a title.
   */
  children?: ReactNode;

  /**
   * `'top'` (default) aligns the slots to the top of the title block, which is
   * what the shop and QR screens do because their subtitle makes the block two
   * lines tall and a centred button would sit halfway down it. `'center'` is
   * for a single-line header — the class-detail back/share pair.
   */
  align?: AppBarAlign;

  /**
   * Apply the safe-area top padding here rather than relying on `Screen`.
   *
   * Default `false`, because `Screen`'s `header` slot already applies
   * `headerTopFor(insets.top)` and applying it twice pushes the title 56pt
   * further down on a device with no notch — a mistake that is invisible on a
   * simulator with a Dynamic Island and obvious on an SE. Set it only when
   * rendering an `AppBar` outside a `Screen`.
   */
  insetTop?: boolean;

  /**
   * Apply the screen gutter here. Default `false` — same reasoning: `Screen`'s
   * header slot supplies it.
   */
  gutter?: boolean;

  /** Bottom padding, in points. The artboards use 20 (`pb-5`) or 24 (`pb-6`). */
  padBottom?: number;

  /** Forwarded to the root node. */
  testID?: string;

  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/** A screen's top bar. Pass it to `Screen`'s `header` slot. */
export function AppBar({
  title,
  titleVariant = 'title',
  titleLines = 2,
  eyebrow,
  subtitle,
  leading,
  trailing,
  children,
  align = 'top',
  insetTop = false,
  gutter = false,
  padBottom = spacing[6],
  testID,
  style,
  className,
}: AppBarProps) {
  const insets = useSafeInsets();

  return (
    <View
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          alignItems: align === 'center' ? 'center' : 'flex-start',
          gap: spacing[3],
          paddingBottom: padBottom,
          ...(insetTop ? { paddingTop: headerTopFor(insets.top) } : {}),
          ...(gutter ? { paddingHorizontal: SCREEN_GUTTER } : {}),
        },
        style,
      ]}
      className={className}
    >
      {leading}

      <View style={{ flex: 1, minWidth: 0 }}>
        {children ?? (
          <>
            {eyebrow ? (
              <Eyebrow color="textSecondary" style={{ marginBottom: spacing[2] }}>
                {eyebrow}
              </Eyebrow>
            ) : null}
            {title ? (
              // `variant="title"` (28) over `level={2}`'s default 24. The
              // heading LEVEL stays 2 — this is the screen's one `role=header`
              // — while the type step is the artboards' screen-title size.
              <Heading level={2} variant={titleVariant} numberOfLines={titleLines}>
                {title}
              </Heading>
            ) : null}
            {subtitle ? (
              <Text variant="bodySmall" color="textSecondary" style={{ marginTop: spacing[2.5] }}>
                {subtitle}
              </Text>
            ) : null}
          </>
        )}
      </View>

      {trailing}
    </View>
  );
}
