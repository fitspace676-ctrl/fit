import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { interactiveA11y } from '../internal/a11y';
import { hitSlopFor } from '../internal/hit-slop';
import { usePressed } from '../internal/use-pressed';
import { Icon } from '../primitives/icon/icon';
import type { IconName } from '../primitives/icon/paths';
import { Eyebrow, Heading, Text } from '../primitives/text';
import { spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

// ===========================================================================
// A SECTION TITLE, WITH AN OPTIONAL "SEE ALL".
//
// Seven instances across four artboards, all the same shape:
// `flex items-baseline justify-between px-5` with an extrabold title on the
// left and a 12px / 600 / ink-400 text button on the right.
//
// `items-baseline`, not `items-center` — the artboards are explicit about it,
// and it is the detail that makes the pairing look designed: a 24px extrabold
// heading beside a 12px label centred vertically leaves the small text
// floating in the middle of the big one's line box, while a shared baseline
// reads as one line of type at two sizes.
// ===========================================================================

/**
 * The two sizes the artboards use, and they are used consistently:
 *
 *   24  `mobile-home-v2.tsx:303`   the home screen's own sections
 *   20  everywhere else            profile, shop, qr, class detail
 *
 * `heading` (24) and `section` (20) are exactly WP-1's two roles for this, and
 * `Heading`'s level ladder already maps 2 → heading and 3 → section — so a
 * size here is an accessibility LEVEL as well as a type step, which is what a
 * rotor user navigates by.
 */
const SIZES = {
  lg: { level: 2, gap: spacing[3] },
  md: { level: 3, gap: spacing[3] },
} as const;

export type SectionHeaderSize = keyof typeof SIZES;

export interface SectionHeaderAction {
  /** The visible text, and the accessible name. Required — rule 1. */
  label: string;
  onPress: () => void;
  /** A trailing glyph — a chevron on a "see all". */
  icon?: IconName;
  /** Longer supporting text, announced after the label. */
  accessibilityHint?: string;
  testID?: string;
}

export interface SectionHeaderProps {
  /** The visible title. Announced as a header at the level `size` implies. */
  title: string;
  /** A small-caps kicker above the title — the classes screen's "აგვისტო 2026". */
  eyebrow?: string;
  /**
   * Supporting copy under the header. Full width, BELOW the header row.
   *
   * ==========================================================================
   * IT USED TO SHARE THE TITLE'S COLUMN, AND THE ACTION NARROWED THAT COLUMN.
   *
   * The header is a row: title block on the left, "see all" on the right. The
   * subtitle sat inside the title block, so an action on the right took ~110pt
   * off the width of a paragraph that has nothing to do with it — and the
   * description wrapped to three ragged lines with an empty gutter beside every
   * one of them. The wider the button, the narrower the prose.
   *
   * A title and its action belong on one line because they are one line of
   * type at two sizes (`items-baseline`, see the header). A DESCRIPTION is not
   * part of that line, and there is no artboard in which it is: it is the
   * section's opening sentence, and a sentence gets the page's width.
   * ==========================================================================
   */
  subtitle?: string;
  /** Default `'md'` (20 / `section` / heading level 3). */
  size?: SectionHeaderSize;
  /** The "see all" on the right. */
  action?: SectionHeaderAction;
  /** Forwarded to the root node. */
  testID?: string;
  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;
  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/**
 * The "see all" button.
 *
 * A 16pt line of text with no plate is 16pt of touch target. `minHeight: 28`
 * plus `hitSlopFor(28)` brings it to exactly 44 without giving the label a
 * visible box the design does not draw — which is the whole reason the slop
 * mechanism exists rather than a padded container.
 */
function Action({ action }: { action: SectionHeaderAction }) {
  const colors = useThemeColors();
  const { pressed, onPressIn, onPressOut } = usePressed();
  const foreground = pressed ? colors.textPrimary : colors.textSecondary;

  return (
    <Pressable
      onPress={action.onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={hitSlopFor(28)}
      testID={action.testID}
      {...interactiveA11y({
        accessibilityLabel: action.label,
        accessibilityHint: action.accessibilityHint,
      })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[1],
        minHeight: 28,
        flexShrink: 0,
      }}
    >
      <Text variant="caption" color={foreground} accessible={false}>
        {action.label}
      </Text>
      {action.icon ? <Icon name={action.icon} color={foreground} size={14} /> : null}
    </Pressable>
  );
}

/** A section title row. */
export function SectionHeader({
  title,
  eyebrow,
  subtitle,
  size = 'md',
  action,
  testID,
  style,
  className,
}: SectionHeaderProps) {
  const dims = SIZES[size];

  const headerRow = (
    <View
      testID={subtitle ? undefined : testID}
      style={[
        {
          flexDirection: 'row',
          // See the header: the artboards' `items-baseline`.
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: dims.gap,
        },
        subtitle ? null : style,
      ]}
      className={subtitle ? undefined : className}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? (
          <Eyebrow color="textSecondary" style={{ marginBottom: spacing[2] }}>
            {eyebrow}
          </Eyebrow>
        ) : null}
        <Heading level={dims.level}>{title}</Heading>
      </View>

      {action ? <Action action={action} /> : null}
    </View>
  );

  // No subtitle, no wrapper: the overwhelming majority of the seven artboard
  // instances are a bare title-and-action row, and wrapping every one of them
  // in a column to serve the few that carry prose would change the node every
  // consumer's `style` and `testID` land on.
  if (!subtitle) return headerRow;

  return (
    <View testID={testID} style={style} className={className}>
      {headerRow}
      <Text variant="bodySmall" color="textSecondary" style={{ marginTop: spacing[2] }}>
        {subtitle}
      </Text>
    </View>
  );
}
