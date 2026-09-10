// @fit/mobile — pause the membership. `mobile-profile.tsx:370-418`.
//
// ===========================================================================
// THE ALLOWANCE IS READ, NOT DISCOVERED AS A 400.
//
// `GET /me/subscription` carries `freezeDaysPerPeriod`, `freezeDaysUsed` and
// `freezeDaysRemaining` for exactly one reason, and `useSubscriptionMutations.ts`
// states it: "the sheet should disable the control rather than discover the
// plan's allowance as a 400". So the durations this sheet offers are narrowed
// to what the member can actually spend (`freezeOptions` in `derive.ts`), and a
// plan with nothing left never opens the sheet at all — the button is absent
// from the block above it.
//
// ---------------------------------------------------------------------------
// FOUR THINGS THAT ARE NOT OBVIOUS.
//
//   1. **`startDate` is now, as an ISO instant.** `freezeSubscriptionSchema`
//      takes `z.string().datetime()`, not a calendar date, so a bare
//      `YYYY-MM-DD` is a 400. The pinned `now` the screen already holds is the
//      right value: a freeze the member asks for is a freeze that starts when
//      they ask.
//
//   2. **The three options are copy-driven, not invented.**
//      `member.profile.mobile.freezeSheet` carries `opt2w` / `opt1m` / `opt2m`
//      and nothing else, so the ladder is 14 / 30 / 60 days. `optDays` is the
//      fallback the catalogue provides for the leftover case — a member with 9
//      days left is offered 9, because offering them 14 and refusing it is the
//      behaviour the allowance fields exist to prevent.
//
//   3. **`Segmented` rather than three `Chip`s.** The artboard draws three
//      equal-width 52pt buttons where exactly one is chosen — that is a radio
//      group, and `Segmented` is the package's equal-width radio group (plan
//      §7's `OptionRow` correction says so in as many words).
//
//   4. **This is a `Sheet`, and a screen may hold only one.** Two overlapping
//      `Modal`s flash black on iOS. The screens that mount this hold a single
//      `sheet: <name> | null`, never a boolean apiece.
//
// ---------------------------------------------------------------------------
// NO "CANCEL MEMBERSHIP" LIVES HERE EITHER. Freeze and cancel are adjacent in
// every product that has both, and only one of them is a member route on this
// API — see `membership-card.tsx`'s header and plan §7.

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { MeSubscription } from '@fit/types';
import { Button, Segmented, Sheet, Text, spacing, useToast } from '@fit/ui-mobile';

import { useFreezeSubscription } from '../../hooks/mutations/useSubscriptionMutations';
import { formatMediumDate } from '../services/date-format';
import { useI18n } from '../../providers/I18nProvider';
import { freezeAllowance, freezeOptions, type FreezeOption } from './derive';

export interface FreezeSheetProps {
  open: boolean;
  onClose: () => void;
  /** The live subscription. `null` closes the sheet — there is nothing to freeze. */
  subscription: MeSubscription | null;
  /** Pinned "now". The freeze starts here. */
  now: Date;
  testID?: string;
}

/** `Segmented` keys are strings; the day count is the value. */
function optionValue(option: FreezeOption): string {
  return String(option.days);
}

/** The freeze confirmation sheet. */
export function FreezeSheet({
  open,
  onClose,
  subscription,
  now,
  testID = 'freeze-sheet',
}: FreezeSheetProps) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const freeze = useFreezeSubscription();

  const allowance = freezeAllowance(subscription);
  const options = freezeOptions(allowance.remaining);
  const [choice, setChoice] = useState<string | null>(null);

  // Re-seed the selection whenever the sheet opens, and whenever the allowance
  // changes underneath it: a member who freezes, resumes and freezes again in
  // one session has a different set of options the second time, and a stale
  // selection would post a duration the server now refuses.
  useEffect(() => {
    if (!open) return;
    const last = options[options.length - 1];
    setChoice(last === undefined ? null : optionValue(last));
    // `options` is derived from `allowance.remaining`, which is the value that
    // actually has to re-seed this — depending on the array itself would re-run
    // on every render, because it is a fresh array each time.
  }, [open, allowance.remaining]);

  if (subscription === null) return null;

  const selected = options.find((option) => optionValue(option) === choice) ?? null;

  function labelFor(option: FreezeOption): string {
    return option.key === null
      ? t('member.profile.mobile.freezeSheet.optDays', { days: option.days })
      : t(`member.profile.mobile.freezeSheet.${option.key}`);
  }

  function confirm() {
    if (selected === null || subscription === null || freeze.isPending) return;
    freeze.mutate(
      {
        subscriptionId: subscription.id,
        // An ISO INSTANT — see note 1 in the header.
        startDate: now.toISOString(),
        durationDays: selected.days,
      },
      {
        onSuccess: (response) => {
          // `FreezeSubscriptionResponse` is `{ frozenUntil }` and nothing else —
          // the resume instant, computed server-side. The card behind the sheet
          // re-reads the whole subscription through the invalidation matrix
          // (`freezeSubscription` → membership + classes + bookings), so the
          // toast is the only consumer of this value.
          toast.success(
            t('member.membership.freeze.frozenToast', {
              date: formatMediumDate(locale, response.frozenUntil),
            }),
          );
          onClose();
        },
        onError: () => {
          // One sentence, from the catalogue. The retry is the button the
          // member just pressed — the same argument `booking-notice.tsx` makes
          // for not adding a second one beside it.
          toast.error(t('member.membership.freeze.errGeneric'));
        },
      },
    );
  }

  return (
    <Sheet
      testID={testID}
      open={open}
      onClose={onClose}
      title={t('member.membership.freeze.modalTitle')}
      subtitle={t('member.profile.mobile.freezeSheet.subtitle')}
      closeAccessibilityLabel={t('member.membership.freeze.cancel')}
      footer={
        <Button
          testID={`${testID}-confirm`}
          label={
            selected === null
              ? t('member.membership.freeze.confirmFreeze')
              : t('member.profile.mobile.freezeSheet.confirm', { label: labelFor(selected) })
          }
          icon="check"
          fullWidth
          busy={freeze.isPending}
          busyLabel={t('member.membership.freeze.working')}
          disabled={selected === null}
          onPress={confirm}
        />
      }
    >
      <View style={{ gap: spacing[4] }}>
        {options.length === 0 ? (
          // Reachable only if the allowance drops to zero while the sheet is
          // open (a freeze from another device). The catalogue has the exact
          // sentence for both halves of that.
          <Text variant="bodySmall" color="textSecondary">
            {allowance.offered
              ? t('member.membership.freeze.exhausted')
              : t('member.membership.freeze.notAvailable')}
          </Text>
        ) : (
          <Segmented
            testID={`${testID}-duration`}
            label={t('member.membership.freeze.durationLabel')}
            value={choice ?? optionValue(options[0] as FreezeOption)}
            onChange={setChoice}
            options={options.map((option) => ({
              value: optionValue(option),
              label: labelFor(option),
            }))}
            disabled={freeze.isPending}
          />
        )}

        <Text variant="bodySmall" color="textSecondary" testID={`${testID}-carryover`}>
          {t('member.profile.mobile.freezeSheet.carryover', { days: allowance.remaining })}
        </Text>

        <Text variant="caption" color="textSecondary">
          {t('member.membership.freeze.used', {
            used: allowance.used,
            total: allowance.perPeriod,
          })}
        </Text>
      </View>
    </Sheet>
  );
}
