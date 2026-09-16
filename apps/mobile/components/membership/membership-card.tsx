// @fit/mobile — the lime block, on real data, on three screens.
//
// ===========================================================================
// THE CARD §1 OF THE PLAN IS ABOUT.
//
// The deleted app drew this block with `ACTIVE`, `22 / 30` and a 73% ring
// baked into the JSX. Every one of those is a field on `GET /me/subscription`.
// This file is the adapter that reads them — and `home.test.tsx` fails if any
// of the four literals reappears in the screen's source.
//
// `MembershipBlock` (WP-9) takes **no status enum**, deliberately: `statusLine`
// and `statusPill` are strings, so `ACTIVE` / `FROZEN` / `PAST_DUE` never
// crosses into `@fit/ui-mobile` and one component serves both artboards. That
// makes composing the sentence this file's job, which is right — the sentence
// needs a locale.
//
// ---------------------------------------------------------------------------
// TWO SHAPES, ONE PAYLOAD.
//
//   {@link HomeMembershipCard}     ring beside the eyebrow + the ink capsule.
//                                  `mobile-home-v2.tsx:228-269`.
//   {@link ProfileMembershipCard}  status pill + a bar under the status line +
//                                  the on-block buttons. `mobile-profile.tsx:184-224`.
//
// Home's shape takes one thing Profile's does not: `coverUrl`, the gym's portal
// photograph, drawn by `MembershipBlock` as a band across the top of the block.
// It is a HOME prop rather than a `CardBase` one because the screen that has
// already resolved the public tenant lookup is Home — see its own header — and a
// second copy of that query on Profile would be a second request for a picture
// that screen does not draw.
//
// ---------------------------------------------------------------------------
// THREE THINGS THIS FILE DELIBERATELY DOES NOT OFFER.
//
//   1. **No "cancel membership" button.** `MeSubscription.cancelAtPeriodEnd`
//      reads like the backing field for a switch, and there is no member route
//      that writes it: enroll / freeze / unfreeze are the only three, and
//      cancellation is `admin/subscriptions` behind `BillingManage` (plan §7).
//      So `member.membership.cancelNotice` is rendered as part of the STATUS
//      LINE and nothing sits beside it to press.
//
//   2. **No check-in / QR action on the capsule.** The artboard's lime disc
//      opened the check-in code; that screen was removed on 2026-08-31 (Q1 —
//      no scanner, no member-scoped check-in endpoint), and
//      `member.home.showQr` / `member.profile.mobile.showQr` are dead copy. The
//      capsule keeps its figure and takes the "manage plan" route instead,
//      which is a destination that exists.
//
//   3. **No invented meter.** `billingPeriodProgress` answers `hasPeriod:
//      false` for a subscription with no dated period, and the ring / bar is
//      then omitted entirely rather than drawn at 0%. See `derive.ts`.
//
// ---------------------------------------------------------------------------
// ONE COPY BORROW, WRITTEN DOWN.
//
// The ink capsule needs a BARE UNIT ("days left") under its figure — 10/600
// small caps, no number in it. `member.home.daysLeft` is the whole sentence
// (`{used} of {total} days left`) and there is no unit-only sibling in
// `member.home`. The one bare string in either catalogue is `qr.daysLeft`
// ("days left" / "დარჩენილი დღე"), authored in both locales for the screen that
// was removed. It is used here rather than inventing Georgian.
// **Owed: `member.home.daysLeftUnit`.** Flagged in the report.

import type { GetMeSubscriptionResponse, MeSubscription } from '@fit/types';
import { EmptyState, MembershipBlock, spacing } from '@fit/ui-mobile';
import { View } from 'react-native';

import { formatMediumDate } from '../services/date-format';
import { useI18n } from '../../providers/I18nProvider';
import {
  billingPeriodProgress,
  freezeAllowance,
  isFrozen,
  isSetToCancel,
  periodPercent,
} from './derive';

/** What both cards need from the screen. */
interface CardBase {
  /** `GET /me/subscription`, already resolved. */
  data: GetMeSubscriptionResponse;
  /** Pinned "now", so the day arithmetic cannot shift between renders. */
  now: Date;
  testID?: string;
}

/**
 * The plan's display name.
 *
 * `planName` is nullable on the wire — a bespoke, plan-less subscription — and
 * the block's `plan` prop is a required string set at 34/800. The status label
 * is the honest fallback: a member on a bespoke plan sees "ACTIVE" in the slot
 * where a plan name would be, which is true, rather than an em dash.
 */
function planLabel(subscription: MeSubscription, statusLabel: string): string {
  const name = subscription.planName?.trim() ?? '';
  return name === '' ? statusLabel : name;
}

/** The lime block on Home — ring, capsule, one route out. */
export function HomeMembershipCard({
  data,
  now,
  onManage,
  coverUrl = null,
  testID = 'home-membership-block',
}: CardBase & {
  onManage: () => void;
  /**
   * The gym's own photograph, drawn as a band across the top of the block.
   *
   * `GET /gyms/by-subdomain/:slug` → `portal.loginImageUrl`: the image the gym
   * uploaded for the member portal's sign-in screen, which is the only
   * gym-authored photograph the API offers a member surface. `null` — the gym
   * uploaded none — is the normal case and draws today's block.
   */
  coverUrl?: string | null;
}) {
  const { t } = useI18n();
  const subscription = data.subscription;

  if (subscription === null) {
    // A member who has never subscribed. A real, renderable `200` — not an
    // error — and the one state where the block is replaced rather than filled.
    return (
      <EmptyState
        testID={`${testID}-none`}
        icon="card"
        title={t('member.membership.noPlan')}
        body={t('member.membership.noPlanHint')}
        action={{
          label: t('member.profile.mobile.browsePlans'),
          onPress: onManage,
          variant: 'primary',
          testID: `${testID}-browse`,
        }}
      />
    );
  }

  const statusLabel = t(`member.membership.status.${subscription.status}`);
  const period = billingPeriodProgress(subscription, now);
  const percent = periodPercent(period);

  // "Active · 8 of 30 days left". The `{used}` placeholder is fed the days
  // REMAINING, not the days elapsed: the sentence it sits in ends "days left",
  // so `{used}` naming notwithstanding, remaining is the number that makes it
  // true. (The artboard makes the same choice and its own two numbers disagree
  // with its own ring; ours cannot, because both come from one function.)
  const daysSentence = period.hasPeriod
    ? t('member.home.daysLeft', { used: period.daysLeft, total: period.daysTotal })
    : null;

  const statusLine = [
    statusLabel,
    daysSentence,
    isSetToCancel(subscription) ? t('member.membership.cancelNotice') : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  return (
    <MembershipBlock
      testID={testID}
      eyebrow={t('member.home.membership')}
      plan={planLabel(subscription, statusLabel)}
      statusLine={statusLine}
      coverUrl={coverUrl}
      progressShape="ring"
      {...(percent === null
        ? {}
        : {
            progressValue: percent,
            progressAccessibilityLabel: t('member.home.membership'),
            progressValueText: daysSentence ?? undefined,
          })}
      {...(period.hasPeriod
        ? {
            highlight: {
              value: String(period.daysLeft),
              // TODO(i18n): `member.home.daysLeftUnit`. `qr.daysLeft` is the
              // only bare unit in either catalogue — see this file's header.
              label: t('qr.daysLeft'),
              accessibilityLabel: daysSentence ?? t('member.home.membership'),
              action: {
                icon: 'arrowUpRight',
                onPress: onManage,
                accessibilityLabel: t('member.home.managePlan'),
                testID: `${testID}-manage`,
              },
            },
          }
        : {})}
    />
  );
}

/** The lime block on Profile — status pill, bar, freeze / resume. */
export function ProfileMembershipCard({
  data,
  now,
  onFreeze,
  onResume,
  onManage,
  manageLabel,
  emptyCopy,
  hideManageAction = false,
  busy = false,
  testID = 'profile-membership-block',
}: CardBase & {
  /** Open the freeze sheet. Absent from the block when the plan offers none. */
  onFreeze: () => void;
  /** Resume a frozen plan. */
  onResume: () => void;
  /**
   * The block's primary route out, and the "no plan" state's CTA. On Profile
   * that is the membership screen; on the membership screen itself it is the
   * plan chooser.
   */
  onManage: () => void;
  /** Overrides `member.membership.managePlan` on the primary button. */
  manageLabel?: string;
  /**
   * The "never subscribed" state's three strings.
   *
   * A prop rather than a constant because D10 assigns a namespace PER SCREEN
   * and this component serves two: Profile reads `member.profile.mobile`
   * ("No active membership") and the membership screen reads `member.membership`
   * ("No active plan"). Both sets exist, both are translated, and choosing
   * per-string inside a shared component is exactly how the two families drift.
   * Defaults to Profile's, which is where the component was first used.
   */
  emptyCopy?: { title: string; body: string; action: string };
  /**
   * Drop the primary button entirely, keeping freeze / resume.
   *
   * The membership screen sets this once a plan is LIVE, and the reason is the
   * API rather than the layout: **there is no member route that changes a
   * plan.** `POST /subscriptions` is enrol-only and answers `409
   * ALREADY_SUBSCRIBED` while a membership is live; switching is
   * `admin/subscriptions`, behind `BillingManage`. The catalogue knows —
   * `member.membership.plan.errAlreadySubscribed` reads "You already have a
   * live membership. Cancel it first, or ask at the front desk to switch." A
   * button whose only outcome is that sentence is not a button.
   */
  hideManageAction?: boolean;
  /** A freeze / unfreeze write is in flight. */
  busy?: boolean;
}) {
  const { t, locale } = useI18n();
  const subscription = data.subscription;

  if (subscription === null) {
    return (
      <EmptyState
        testID={`${testID}-none`}
        icon="card"
        title={emptyCopy?.title ?? t('member.profile.mobile.noPlanTitle')}
        body={emptyCopy?.body ?? t('member.profile.mobile.noPlanHint')}
        action={{
          label: emptyCopy?.action ?? t('member.profile.mobile.browsePlans'),
          onPress: onManage,
          variant: 'primary',
          testID: `${testID}-browse`,
        }}
      />
    );
  }

  const statusLabel = t(`member.membership.status.${subscription.status}`);
  const period = billingPeriodProgress(subscription, now);
  const percent = periodPercent(period);
  const frozen = isFrozen(subscription);
  const allowance = freezeAllowance(subscription);

  const daysSentence = period.hasPeriod
    ? t('member.profile.mobile.daysLeft', { used: period.daysLeft, total: period.daysTotal })
    : null;

  // Frozen plans say when they resume; live plans say when they renew. Both
  // dates are on the payload, so neither is a guess.
  const dateLine = frozen
    ? subscription.frozenUntil === null
      ? null
      : t('member.profile.mobile.frozenUntil', {
          date: formatMediumDate(locale, subscription.frozenUntil),
        })
    : t('member.profile.mobile.renews', {
        date: formatMediumDate(locale, subscription.currentPeriodEnd),
      });

  const statusLine = [
    dateLine,
    frozen ? null : daysSentence,
    isSetToCancel(subscription) ? t('member.membership.cancelNotice') : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  // The two on-block buttons. `manage` is always offered; the second one is
  // freeze OR resume, and it is ABSENT — not disabled — on a plan whose
  // allowance is zero, because `member.membership.freeze.notAvailable` is a
  // sentence the membership screen renders and a dead button here would say
  // nothing.
  const actions = [
    ...(hideManageAction
      ? []
      : [
          {
            label: manageLabel ?? t('member.membership.managePlan'),
            onPress: onManage,
            primary: true,
            testID: `${testID}-manage`,
          },
        ]),
    ...(frozen
      ? [
          {
            label: t('member.profile.mobile.resumeNow'),
            onPress: onResume,
            icon: 'refresh' as const,
            disabled: busy,
            testID: `${testID}-resume`,
          },
        ]
      : allowance.offered && allowance.available
        ? [
            {
              label: t('member.profile.mobile.freeze'),
              onPress: onFreeze,
              icon: 'pause' as const,
              disabled: busy,
              testID: `${testID}-freeze`,
            },
          ]
        : []),
  ];

  return (
    <View style={{ gap: spacing[3] }}>
      <MembershipBlock
        testID={testID}
        eyebrow={t('member.profile.mobile.membership')}
        plan={planLabel(subscription, statusLabel)}
        statusPill={statusLabel}
        statusLine={statusLine}
        progressShape="bar"
        {...(percent === null
          ? {}
          : {
              progressValue: percent,
              progressAccessibilityLabel: t('member.profile.mobile.membership'),
              progressValueText: daysSentence ?? undefined,
            })}
        actions={actions}
      />
    </View>
  );
}
