import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { clampRadiusTo } from '../internal/clamp-radius';
import { hitSlopFor } from '../internal/hit-slop';
import { interactiveA11y } from '../internal/a11y';
import { usePressed } from '../internal/use-pressed';
import { IconButton } from '../forms/icon-button';
import { Avatar, type AvatarProps, type AvatarRing } from '../primitives/avatar';
import { Icon } from '../primitives/icon/icon';
import type { IconName } from '../primitives/icon/paths';
import { Text } from '../primitives/text';
import { spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

// ===========================================================================
// A PERSON, IN A ROW.
//
// Two instances, two screens, one shape:
//
//   mobile-home-v2.tsx:398    "შენი მწვრთნელი" · Ana G. · a 44pt lime arrow
//   mobile-class-detail:200   "მწვრთნელი"      · Sandro K. · a "პროფილი" button
//
//   rounded-[26px] bg-ink-900 p-4, gap-3
//   52pt avatar, ring-2 ring-ink-700
//   eyebrow 11 / 600 / 0.12em uppercase, ink-400
//   mt-1   name 16 / 700, white, truncating
//   mt-0.5 meta 12, ink-400, truncating
//
// ---------------------------------------------------------------------------
// THE ACTION IS A DISCRIMINATED PROP, NOT A `ReactNode`.
//
// The two artboards put two different controls in the same slot: a 44pt round
// lime icon button, and a small labelled ink button. A `ReactNode` slot would
// take either — and would also take a third thing nobody designed, at a size
// nobody checked, with no `accessibilityLabel` and no 44pt floor. A union of
// the two shipped shapes makes the label required on the icon arm (where it is
// the only thing a screen reader has) and keeps both arms' touch targets this
// component's problem rather than the call site's.
//
// ---------------------------------------------------------------------------
// `onPress` AND `action` ARE MUTUALLY EXCLUSIVE, IN THE TYPE.
//
// The row was unconditionally inert, because a row that is a button CONTAINING
// a button gives a screen-reader user two stops that do different things and no
// way to tell which is which. That reasoning rules out the combination — not
// the whole row being the control.
//
// So there are two shapes and the props union lets a caller pick exactly one:
//
//   action   the row is text, and ONE labelled control sits on the right.
//   onPress  the WHOLE row is the control — `accessibilityRole="button"`, one
//            stop, one name, and a trailing chevron, which is the same "a row
//            without `onPress` is not a button and draws no chevron" rule
//            `ListRow` already states. The name is a REQUIRED prop rather than
//            derived from `name`: what the row is FOR ("Trainer, Sandro K.")
//            is copy, and copy is always the caller's (package rule 1).
//
// Class detail is what asked for the second shape: the trainer row opens the
// coach's details, and the artboard's small "პროფილი" button is a 36pt target
// inside a 84pt row that is doing nothing.
// ---------------------------------------------------------------------------
// ===========================================================================

/** The artboards' avatar size in this row. */
const AVATAR = 52;

/** The labelled action's plate. `px-4 py-2.5` on a 12/600 label = 36 tall. */
const LABEL_ACTION_HEIGHT = 36;

/**
 * The two controls the artboards hang on the right of this row.
 *
 * `icon` renders WP-5's `IconButton` in its `accent` variant — a 44pt lime
 * plate with an ink-950 glyph, which is `mobile-home-v2.tsx:411` exactly.
 */
export type PersonRowAction =
  | {
      kind: 'icon';
      icon: IconName;
      /** REQUIRED. An icon-only control is silent without one. */
      accessibilityLabel: string;
      onPress: () => void;
      disabled?: boolean;
      testID?: string;
    }
  | {
      kind: 'label';
      /** The visible label — "პროფილი". Also the accessible name by default. */
      label: string;
      onPress: () => void;
      /** Overrides the spoken name when the visible one is not enough. */
      accessibilityLabel?: string;
      disabled?: boolean;
      testID?: string;
    };

/** Everything both shapes of the row carry. See {@link PersonRowProps}. */
export interface PersonRowIdentity {
  /** The person's name. Required — copy is always the caller's. */
  name: string;

  /**
   * The small-caps caption above the name — "შენი მწვრთნელი", "მწვრთნელი".
   * Optional: the shape reads fine without one.
   */
  eyebrow?: string;

  /** One truncating line under the name — "Spin · CrossFit · Main Floor". */
  meta?: string;

  /** A remote or bundled portrait. Omit and the monogram is drawn. */
  avatarSource?: AvatarProps['source'];

  /**
   * The monogram fallback. Passed rather than derived: initial-taking is
   * locale-specific and this package does not know the locale.
   */
  initials?: string;

  /**
   * Default `'neutral'` — `ring-2 ring-ink-700`, which is what both artboards
   * draw on a person who is not the signed-in member. `'accent'` is the lime
   * ring the design reserves for "this is you".
   */
  avatarRing?: AvatarRing;

  /** Forwarded to the root node. */
  testID?: string;

  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/** The inert row: text, with at most one labelled control on the right. */
export interface PersonRowWithAction extends PersonRowIdentity {
  /** The control on the right. See {@link PersonRowAction}. */
  action?: PersonRowAction;
  onPress?: never;
  accessibilityLabel?: never;
  accessibilityHint?: never;
}

/** The row AS the control — one stop, one name, a chevron. */
export interface PressablePersonRowProps extends PersonRowIdentity {
  /** Press the whole row. Excludes {@link PersonRowWithAction.action}. */
  onPress: () => void;

  /**
   * REQUIRED. The row announces once, under this name — "მწვრთნელი, Sandro K."
   * — rather than reading its three text nodes in turn and leaving a
   * screen-reader user to infer that the block is pressable at all.
   */
  accessibilityLabel: string;

  /** What the press does, announced after the label. */
  accessibilityHint?: string;

  action?: never;
}

/**
 * A person, in a row. Either shape — see the header.
 */
export type PersonRowProps = PersonRowWithAction | PressablePersonRowProps;

/** The small labelled button: `CUT_SM` → the `inner` rung, ink-800 plate. */
function LabelAction({ action }: { action: Extract<PersonRowAction, { kind: 'label' }> }) {
  const colors = useThemeColors();
  const { pressed, onPressIn, onPressOut } = usePressed();
  const disabled = action.disabled ?? false;

  return (
    <Pressable
      testID={action.testID}
      onPress={action.onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      // 36pt tall, so the component applies the slop itself rather than
      // leaving it to a call site that will remember today and not in June.
      hitSlop={hitSlopFor(LABEL_ACTION_HEIGHT)}
      {...interactiveA11y(
        { accessibilityLabel: action.accessibilityLabel ?? action.label },
        { disabled },
      )}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: LABEL_ACTION_HEIGHT,
        minWidth: LABEL_ACTION_HEIGHT,
        paddingHorizontal: spacing[4],
        paddingVertical: spacing[2.5],
        borderRadius: clampRadiusTo('inner', LABEL_ACTION_HEIGHT),
        // `bg-ink-800` → `hover:bg-ink-700`: the artboard's pressed state, as a
        // background step rather than an opacity fade.
        backgroundColor: pressed ? colors.borderEmphasized : colors.quiet,
      }}
    >
      {/*
        `text-[12px] font-semibold`, neither uppercase nor tracked. WP-1's two
        12px roles are `caption` (12/500, plain) and `eyebrow` (12/600, but
        small-caps); this takes `caption`'s size and leading and raises only the
        weight — the same trade `Pill` documents in `src/feedback/pill.tsx`.
      */}
      <Text
        variant="caption"
        color={disabled ? 'textDisabled' : 'textPrimary'}
        accessible={false}
        style={{ fontWeight: '600' }}
      >
        {action.label}
      </Text>
    </Pressable>
  );
}

/** `h-4` — the trailing chevron, the same one `ListRow` draws. */
const CHEVRON = 16;

/** A trainer, a member, a person — with one action beside them. */
export function PersonRow(props: PersonRowProps) {
  const {
    name,
    eyebrow,
    meta,
    avatarSource,
    initials,
    avatarRing = 'neutral',
    action,
    testID,
    style,
    className,
  } = props;
  const colors = useThemeColors();
  const { pressed, onPressIn, onPressOut } = usePressed();

  const pressable = props.onPress !== undefined;

  const shell = [
    {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[3],
      // `bg-ink-900 → hover:bg-ink-800`, the palette step `usePressed`
      // documents. Only the pressable shape ever moves off the resting fill.
      backgroundColor: pressable && pressed ? colors.quiet : colors.backgroundCard,
      borderRadius: clampRadiusTo('container'),
      padding: spacing[4],
    } satisfies ViewStyle,
    style,
  ];

  const body = (
    <>
      <Avatar
        source={avatarSource}
        initials={initials}
        size={AVATAR}
        ring={avatarRing}
        // Decorative on purpose: the name is the very next node, and an avatar
        // that announced it would just say it twice. See `Avatar`'s own note.
      />

      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? (
          <Text variant="label" color="textSecondary" numberOfLines={1}>
            {eyebrow}
          </Text>
        ) : null}
        <Text
          variant="bodyLarge"
          color="textPrimary"
          numberOfLines={1}
          style={eyebrow ? { marginTop: spacing[1] } : null}
        >
          {name}
        </Text>
        {meta ? (
          <Text
            variant="caption"
            color="textSecondary"
            numberOfLines={1}
            style={{ marginTop: spacing[0.5] }}
          >
            {meta}
          </Text>
        ) : null}
      </View>

      {action?.kind === 'icon' ? (
        <IconButton
          variant="accent"
          icon={action.icon}
          accessibilityLabel={action.accessibilityLabel}
          onPress={action.onPress}
          disabled={action.disabled ?? false}
          testID={action.testID}
        />
      ) : action?.kind === 'label' ? (
        <LabelAction action={action} />
      ) : pressable ? (
        // `ListRow`'s rule, applied to this row: the chevron is what says the
        // block is pressable, and it appears only when it is.
        <Icon name="chevronRight" color="iconDisabled" size={CHEVRON} />
      ) : null}
    </>
  );

  if (props.onPress === undefined) {
    return (
      <View testID={testID} style={shell} className={className}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={props.onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      {...interactiveA11y({
        accessibilityLabel: props.accessibilityLabel,
        ...(props.accessibilityHint === undefined
          ? {}
          : { accessibilityHint: props.accessibilityHint }),
      })}
      style={shell}
      className={className}
    >
      {body}
    </Pressable>
  );
}
