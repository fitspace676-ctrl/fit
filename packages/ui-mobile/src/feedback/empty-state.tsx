import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Button, type ButtonVariant } from '../forms/button';
import { DECORATIVE } from '../internal/a11y';
import { Icon } from '../primitives/icon/icon';
import type { IconName } from '../primitives/icon/paths';
import { Surface } from '../primitives/surface';
import { Text } from '../primitives/text';
import { layout, spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

// ===========================================================================
// EMPTY — AND, PER PLAN ITEM G-05, ERROR TOO.
//
// No artboard draws a failed load. Six screens draw an empty one, and the
// difference between "there is nothing here" and "we could not find out what
// is here" is a glyph, a sentence and whether the button says "browse" or
// "try again" — all three of which are the SCREEN'S copy, and all three of
// which arrive here as props. So this component is the error state as well:
// `icon="info"`, a title, and an action whose `onPress` refetches.
//
// The plan is explicit about the alternative, and it is worth restating: a
// toast alone is never an error state, because it auto-dismisses. A member who
// looks up four seconds late sees an empty screen and no explanation.
//
// ---------------------------------------------------------------------------
// TWO LAYOUTS, AND THE SCREEN CHOOSES.
//
//   `panel`  Inside a `Surface` — radius 30, `px-6 py-12`. This is the empty
//            state that replaces a LIST on a screen that still has a header
//            and a tab bar around it.
//   `bare`   No shell, `py-10`. This is the empty state INSIDE a sheet
//            (`mobile-shop.tsx:293-305`), where the sheet is already a panel
//            and a second one inside it reads as a box in a box. The button
//            steps up from `md` to `lg` to match the sheet's own 52pt CTAs.
//
// The classes screen branches its TITLE and its ACTION on whether filters are
// active ("no classes today" + "see all" versus "nothing matches" + "clear
// filters"). That is the screen's decision and it stays there — this component
// renders what it is handed, which is what keeps it free of copy.
// ---------------------------------------------------------------------------

export type EmptyStateLayout = 'panel' | 'bare';

/** The one action an empty state offers. There is never a second. */
export interface EmptyStateAction {
  /** REQUIRED, and also the button's accessible name. */
  label: string;
  onPress: () => void;
  /** Default `'primary'` — the empty state's whole job is to offer the way out. */
  variant?: ButtonVariant;
  icon?: IconName;
  /** An action in flight — a retry that is retrying. */
  busy?: boolean;
  testID?: string;
}

/**
 * The medallion's geometry — a 56pt ring around a 24pt glyph.
 *
 * Sourced from `design-system.tsx:613-615`, which is the only place in the
 * design that draws one. It is NOT a gallery-vs-artboard conflict: no artboard
 * draws an empty state with a glyph at all, so the gallery is not contradicted
 * here, only extended. The ring is a hairline in `border` over the page
 * ground, so it reads on a card and on the canvas alike.
 */
const MEDALLION_SIZE = spacing[14];
const MEDALLION_GLYPH = spacing[6];

/** Layout -> the geometry that differs between the two. */
const LAYOUTS = {
  panel: { padHorizontal: 6, padVertical: 12, buttonSize: 'md' },
  bare: { padHorizontal: 0, padVertical: 10, buttonSize: 'lg' },
} as const satisfies Record<
  EmptyStateLayout,
  { padHorizontal: 0 | 6; padVertical: 10 | 12; buttonSize: 'md' | 'lg' }
>;

export interface EmptyStateProps {
  /** REQUIRED. "No classes today", "Your cart is empty", "Could not load". */
  title: string;
  /** The line under it. */
  body?: string;
  /** Drawn in a ring above the title. Omit for the sheet's text-only empty. */
  icon?: IconName;
  /** Default `'panel'`. */
  layout?: EmptyStateLayout;
  /** The way out. Omitted, no button renders at all. */
  action?: EmptyStateAction;
  /** Anything the three slots above cannot express. */
  children?: ReactNode;
  testID?: string;
  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;
  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/**
 * "There is nothing here, and here is what to do about it."
 *
 * THE TITLE IS 17/700 IN BOTH LAYOUTS, which is `subtitle`, and that is a
 * deliberate one-point departure from the brief's "18/700" for `panel`.
 * `tokens/typography.ts` counted the sizes the artboards use and FOLDED 18px
 * into its neighbour, on the grounds that a role with a single call site is a
 * literal wearing a name. 17 is that neighbour. Writing `fontSize: 18` here
 * would re-create the exact drift the type scale exists to prevent, and it
 * would do it for one point at the top of one box.
 *
 * The two layouts stay distinguishable on the three things that actually
 * separate them — a shell, the padding, and a 44pt versus 52pt button.
 */
export function EmptyState({
  title,
  body,
  icon,
  layout: layoutName = 'panel',
  action,
  children,
  testID,
  style,
  className,
}: EmptyStateProps) {
  const colors = useThemeColors();
  const dims = LAYOUTS[layoutName];

  const content = (
    <>
      {icon ? (
        <View
          {...DECORATIVE}
          style={{
            width: MEDALLION_SIZE,
            height: MEDALLION_SIZE,
            borderRadius: MEDALLION_SIZE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: layout.hairline,
            borderColor: colors.border,
            backgroundColor: colors.backgroundBody,
            marginBottom: spacing[4],
          }}
        >
          <Icon name={icon} color="iconSecondary" size={MEDALLION_GLYPH} />
        </View>
      ) : null}

      <Text variant="subtitle" align="center">
        {title}
      </Text>

      {body ? (
        <Text
          variant="bodySmall"
          color="textSecondary"
          align="center"
          style={{ marginTop: spacing[2] }}
        >
          {body}
        </Text>
      ) : null}

      {children ? <View style={{ marginTop: spacing[4] }}>{children}</View> : null}

      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant={action.variant ?? 'primary'}
          size={dims.buttonSize}
          icon={action.icon}
          busy={action.busy}
          testID={action.testID}
          style={{ marginTop: spacing[5] }}
        />
      ) : null}
    </>
  );

  const inner = {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[dims.padHorizontal],
    paddingVertical: spacing[dims.padVertical],
  } as const;

  if (layoutName === 'bare') {
    return (
      <View testID={testID} style={[inner, style]} className={className}>
        {content}
      </View>
    );
  }

  return (
    // 30 is one of the artboards' pass-through literals (`PASSTHROUGH_RADII`),
    // not a missing rung: it is the "big soft box that is not a hero block"
    // corner, sitting between `container` (26) and `page` (32).
    <Surface testID={testID} radius={30} style={[inner, style]} className={className}>
      {content}
    </Surface>
  );
}
