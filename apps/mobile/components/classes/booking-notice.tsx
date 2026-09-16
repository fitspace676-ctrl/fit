// @fit/mobile — what a refused booking looks like on screen.
//
// Two states, not one, and the split is the point.
//
//   the refusal   403 `SUBSCRIPTION_FROZEN`. The member has done nothing wrong
//                 and pressing the button again cannot work — the plan has to be
//                 resumed first. So this is drawn in MEMBERSHIP vocabulary with
//                 a route out, not as an error. (The work-package brief predicted
//                 a 409; `bookings.service.ts:456` throws a 403. Either way it
//                 is `code`, never the status, that is branched on.)
//
//   the error     everything else, as one of the six real
//                 `member.actions.err*` sentences.
//
// THERE IS NO "TRY AGAIN" BUTTON HERE, DELIBERATELY. The retry for a failed
// write is the CTA the member just pressed — a card's action button one line
// away, or the sticky bar directly below. A second button that does the same
// thing is the "fifteen spellings of Try again" problem the plan's shared-chrome
// note is about, and it would sit further from the finger than the real one.
// The invalidation matrix has already refreshed the class by the time this
// renders, so the CTA beside it is showing the CURRENT state. `auth-error.ts`
// draws the same line for the same reason: on a form, the retry IS submit.
//
// (The LOAD errors — the week that would not fetch, the class that 404s — are
// the ones §6 item 3 names, and those do carry a working retry; see the
// screens' `EmptyState` branches.)

import { useRouter } from 'expo-router';
import { Alert, Button } from '@fit/ui-mobile';

import { useI18n } from '../../providers/I18nProvider';
import type { BookingFailure } from './use-class-booking';

export interface BookingFailureNoticeProps {
  failure: BookingFailure;
  testID?: string;
}

/** The advisory a failed book / cancel leaves on the screen. */
export function BookingFailureNotice({
  failure,
  testID = 'class-booking-error',
}: BookingFailureNoticeProps) {
  const { t } = useI18n();
  const router = useRouter();

  if (failure.frozen) {
    return (
      <Alert
        testID={`${testID}-frozen`}
        tone="warning"
        icon="pause"
        live
        // TODO(i18n): there is no `member.actions.errFrozen`. These three are
        // real, translated strings from the membership namespace and they say
        // the true thing — the plan is paused, it resumes on its own, and here
        // is where to change that. A dedicated "you can't book while frozen"
        // sentence would be better and is owed; nothing is invented here.
        title={t('member.membership.status.FROZEN')}
        body={t('member.membership.freeze.frozenHint')}
      >
        <Button
          label={t('member.membership.managePlan')}
          onPress={() => {
            // `membership` is `auth` in ROUTE_POLICY and C5 builds the screen —
            // the same forward link `app/(tabs)/profile/index.tsx` already makes
            // to `/profile/billing` and `/trainers`.
            router.push('/membership');
          }}
          variant="secondary"
          size="sm"
          testID={`${testID}-manage-plan`}
        />
      </Alert>
    );
  }

  return (
    <Alert
      testID={testID}
      tone="danger"
      icon="info"
      // The direct result of pressing a button, so a screen-reader user who
      // heard nothing after pressing must be told why.
      live
      title={t(failure.messageKey)}
    />
  );
}
