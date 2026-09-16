// The accessibility props this package sets, in one place.
//
// ---------------------------------------------------------------------------
// THE RULE THESE ENCODE.
//
// Rule 1 of the package (see `index.ts`): no component ships copy, and every
// label — INCLUDING every `accessibilityLabel` — is a required prop. That rule
// only holds if the components make the label impossible to forget, which is a
// type-system job, not a runtime one; see `IconButtonProps.accessibilityLabel`
// for the shape (a required `string`, not `string | undefined`).
//
// What this module owns is the other half: the props that make a labelled
// control announce ONCE. React Native's screen readers walk the tree, so a
// button labelled "notifications" containing an `Icon` and a badge reading "3"
// will announce all three unless the decorative children opt out. Getting that
// wrong is not a visual bug — it never appears in a screenshot, and the
// component looks perfect right up until someone turns VoiceOver on.
// ---------------------------------------------------------------------------

import type { AccessibilityProps, AccessibilityRole } from 'react-native';

/**
 * "This node is paint; the control around it carries the meaning."
 *
 * Spread onto every `Icon`, badge and monogram that sits inside a labelled
 * control. All three flags are needed, and they are not redundant:
 *
 *   · `accessible: false`               — the shared React Native flag.
 *   · `accessibilityElementsHidden`     — iOS; hides the node and its subtree.
 *   · `importantForAccessibility`       — Android; same effect, different API.
 *
 * `Icon` applies this BY DEFAULT — a decorative glyph is overwhelmingly the
 * common case, and the failure mode of the other default (every icon in the app
 * announcing its own name over the label of the control it is inside) is much
 * worse than the failure mode of this one (an icon used *as* the whole meaning
 * is silent until someone passes it a label).
 */
export const DECORATIVE = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const satisfies AccessibilityProps;

/** What every interactive component in this package needs to be handed. */
export interface InteractiveA11y {
  /** Required. Rule 1: the package ships no copy, so the caller supplies it. */
  accessibilityLabel: string;
  /** Longer supporting text, announced after the label. */
  accessibilityHint?: string;
  /** Defaults to `'button'`. */
  accessibilityRole?: AccessibilityRole;
}

/** The state flags a control reflects to the screen reader. */
export interface InteractiveState {
  disabled?: boolean;
  /** A toggle's on/off. Reflected as `selected`, not as a label change. */
  selected?: boolean;
  busy?: boolean;
  expanded?: boolean;
}

/**
 * Build the a11y prop bag for an interactive control.
 *
 * `accessibilityState` is always present, even when every flag is false. That
 * is deliberate: a `selected` toggle whose state object appears only once
 * something is selected reads to the screen reader as "a button that sometimes
 * has a state", and the announcement changes shape mid-interaction. Always
 * emitting the keys the control actually supports keeps the announcement
 * stable.
 */
export function interactiveA11y(
  a11y: InteractiveA11y,
  state: InteractiveState = {},
): AccessibilityProps & { accessibilityLabel: string } {
  const { accessibilityLabel, accessibilityHint, accessibilityRole = 'button' } = a11y;
  const { disabled = false, selected, busy, expanded } = state;

  return {
    accessible: true,
    accessibilityRole,
    accessibilityLabel,
    ...(accessibilityHint ? { accessibilityHint } : {}),
    accessibilityState: {
      disabled,
      ...(selected === undefined ? {} : { selected }),
      ...(busy === undefined ? {} : { busy }),
      ...(expanded === undefined ? {} : { expanded }),
    },
  };
}

/**
 * A11y props for a piece of text whose GLYPHS are not what should be spoken.
 *
 * The case this exists for is `Money` and `Mono`. VoiceOver reads a monospace,
 * tabular-figure string like `89.00 ₾` character by character — "eight nine
 * full stop zero zero" — because nothing in the string tells it the run is a
 * quantity. An explicit label replaces the whole run with the spoken form the
 * caller supplies ("89 lari"), which is copy, and therefore a prop.
 */
export function spokenAs(label: string | undefined): AccessibilityProps {
  if (!label) return {};
  return { accessible: true, accessibilityLabel: label };
}
