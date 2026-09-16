import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '../forms/button';
import { Surface } from '../primitives/surface';
import { Text } from '../primitives/text';
import type { IconName } from '../primitives/icon/paths';
import { spacing } from '../tokens/spacing';

import { InlineNote } from './alert';
import { weightedType } from './feedback-metrics';
import { Sheet } from './sheet';

// ===========================================================================
// "ARE YOU SURE?" — the sheet at `mobile-class-detail.tsx:263-329`.
//
// A recap card, an advisory line, and two buttons. Built ON `Sheet` rather
// than beside it, so the scrim, the animation, the hardware-back handling and
// the six pitfalls documented in `sheet.tsx` exist in one place. This file is
// the CONTENT.
//
// ---------------------------------------------------------------------------
// THE ONLY RED FILL IN THE MOBILE SET.
//
// `destructive` renders the confirm button as `Button variant="destructive"`,
// which is the `error` role on `onError` — and nothing else on the phone is
// filled red. Not the occupancy bar at 100% (that is a 8pt track, not a
// surface), not an alert, not a badge. That scarcity is the point: when a
// member sees a red rectangle it means "this cancels something", every time.
//
// A NOTE ON THE EXACT RED. The artboard writes `bg-danger-500`; WP-1's `error`
// role resolves to `danger-400` in dark mode. The one-step difference is the
// token layer's decision, not this component's — `Button`'s `destructive`
// variant already made it, and two different reds for "over capacity" and
// "cancel this booking" would be worse than one that is one ramp step off the
// comp. Flagged rather than silently re-fixed here.
// ---------------------------------------------------------------------------

/** `rounded-[26px]` — which is `container`, the panel rung, exactly. */
const RECAP_RADIUS = 'container' as const;

/**
 * The two buttons' flex.
 *
 * `flexGrow: 1, flexBasis: 'auto'` rather than `flex: 1`. `Button` sets
 * `flexShrink: 0` on itself — deliberately, so a button beside a long label is
 * not squeezed below its designed width — and `flex: 1` is a shorthand that
 * would have to fight it in a flattened style array whose winner depends on
 * key order. Naming grow and basis says exactly what is meant and collides
 * with nothing.
 *
 * ==========================================================================
 * `'auto'`, NOT `0`, AND THAT IS THE WHOLE FIX.
 *
 * The artboards' `flex-1` was transcribed as `flexBasis: 0` — two exactly
 * equal halves, whatever the labels say. In English that is fine. In Georgian
 * the booking confirmation asked the member to commit on "გაკვეთილის…", cut
 * mid-word, while "დახურვა" sat in an equally wide half with room to spare:
 * the one control whose label has to be read in full was the one that could
 * not be, and it was the *symmetry* that did it, not the width.
 *
 * `flexBasis: 'auto'` makes each button's own label its starting size, so:
 *
 *   · both fit  → they share the row and `flexGrow` spends the slack on both,
 *     which for two comparable labels is the artboards' 50/50 to within a few
 *     points, and for "Close" vs "Cancel this booking" gives the sentence the
 *     room and the dismissal the rest;
 *   · they do not fit → `Sheet`'s footer row (`flexWrap: 'wrap'`) breaks the
 *     line and each button takes a full-width row of its own. Nothing
 *     truncates, and no measurement pass is needed to decide it.
 *
 * Stacked, the dismissal is on top and the commitment underneath — DOM order
 * preserved, so the focus order and the reading order do not change with the
 * screen width, and the affirmative lands closest to the thumb.
 * ==========================================================================
 */
const SHARE: ViewStyle = { flexGrow: 1, flexBasis: 'auto' };

export interface ConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;

  /** REQUIRED. "Cancel this booking?" — the question itself. */
  title: string;

  /** REQUIRED — the sheet's close button is icon-only. */
  closeAccessibilityLabel: string;

  /** REQUIRED. The confirming button's label AND its accessible name. */
  confirmLabel: string;

  /** REQUIRED. The dismissing button's label. */
  cancelLabel: string;

  /**
   * The recap card's headline — the thing being confirmed, named.
   *
   * Omitted with `recapLines`, no card renders. A confirmation with no recap
   * asks the member to remember what they tapped, which on a list screen they
   * often cannot.
   */
  recapTitle?: string;

  /** The muted 13/500 lines under the recap headline. */
  recapLines?: readonly string[];

  /** The advisory under the recap — the cancellation window, the free period. */
  note?: string;

  /** Default `'bolt'`, the artboards' own advisory glyph. */
  noteIcon?: IconName;

  /** Red fill on the confirm button. */
  destructive?: boolean;

  /**
   * The confirmation is in flight.
   *
   * Passed straight to the confirm `Button`, which keeps its fill, swaps its
   * label for a spinner, announces `accessibilityState.busy` and SWALLOWS
   * further presses — so a double tap cannot send two cancellations.
   */
  busy?: boolean;

  /** What the confirm button says while `busy`. Defaults to `confirmLabel`. */
  busyLabel?: string;

  /** Anything between the recap and the note. */
  children?: ReactNode;

  testID?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

/** A `Sheet` that asks one question and offers two answers. */
export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  closeAccessibilityLabel,
  confirmLabel,
  cancelLabel,
  recapTitle,
  recapLines,
  note,
  noteIcon = 'bolt',
  destructive = false,
  busy = false,
  busyLabel,
  children,
  testID,
  style,
  className,
}: ConfirmSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      closeAccessibilityLabel={closeAccessibilityLabel}
      testID={testID}
      style={style}
      className={className}
      footer={
        <>
          <Button
            label={cancelLabel}
            onPress={onClose}
            variant="secondary"
            size="lg"
            style={SHARE}
            testID={testID ? `${testID}-cancel` : undefined}
          />
          <Button
            label={confirmLabel}
            onPress={onConfirm}
            variant={destructive ? 'destructive' : 'primary'}
            size="lg"
            busy={busy}
            busyLabel={busyLabel}
            style={SHARE}
            testID={testID ? `${testID}-confirm` : undefined}
          />
        </>
      }
    >
      {recapTitle || (recapLines && recapLines.length > 0) ? (
        <Surface
          tone="body"
          radius={RECAP_RADIUS}
          border
          padding={5}
          testID={testID ? `${testID}-recap` : undefined}
          // `accessible` groups the headline and its lines into one
          // announcement: they are one fact ("Spin Express, Thursday 18:00,
          // Sandro K."), and three swipes to hear it is three swipes too many.
          accessible
        >
          {recapTitle ? (
            // 22/800 with `leading-none` on the artboard. `subheading` is
            // 22/800 at a 26pt line, which is the scale's answer for a card
            // headline and reads better than a 22pt line on Georgian
            // ascenders — see the clipping note in `primitives/text.tsx`.
            <Text variant="subheading" accessible={false}>
              {recapTitle}
            </Text>
          ) : null}
          {recapLines?.map((line, index) => (
            <Text
              key={line}
              color="textSecondary"
              accessible={false}
              style={[
                weightedType('bodySmall', '500'),
                { marginTop: index === 0 ? spacing[2.5] : spacing[1] },
              ]}
            >
              {line}
            </Text>
          ))}
        </Surface>
      ) : null}

      {children ? <View style={{ marginTop: spacing[4] }}>{children}</View> : null}

      {note ? (
        <InlineNote
          icon={noteIcon}
          testID={testID ? `${testID}-note` : undefined}
          style={{ marginTop: spacing[4] }}
        >
          {note}
        </InlineNote>
      ) : null}
    </Sheet>
  );
}

/**
 * The share, exported.
 *
 * Five artboards end in a row of `h-[52px] flex-1` buttons and only one of them
 * is a confirmation, so the other four will build their own footer. Handing
 * them the same style is what keeps the five rows behaving the same way — and,
 * since the fix above, what gives all five the stack-instead-of-truncate
 * behaviour rather than only this one.
 *
 * `SHEET_FOOTER_HALF` is kept as the old name: it is exported from the package
 * root and renaming an export to describe an internal change is churn. The
 * "half" is still what two comparable labels get.
 */
export { SHARE as SHEET_FOOTER_SHARE, SHARE as SHEET_FOOTER_HALF };
