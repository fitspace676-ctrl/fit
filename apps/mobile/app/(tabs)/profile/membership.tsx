// `/profile/membership` — the plan, the period, the freeze, the facts.
//
// ===========================================================================
// COPY IS `member.membership` (D10), AND IT DESCRIBES THIS SCREEN EXACTLY.
//
// 60-odd pre-authored keys in both locales: the six status labels, the renewal
// and access-until lines, the cancel notice, `memberSince`, the payment method,
// a complete `freeze` block (16 keys, including both refusal sentences and both
// toasts), a `credits` block and a `plan` block. Nothing below is a proposal.
//
// ---------------------------------------------------------------------------
// THREE THINGS THE API WILL NOT LET THIS SCREEN DO.
//
//   1. **Cancel the membership.** `MeSubscription.cancelAtPeriodEnd` is on the
//      payload and there is no member route that writes it — enroll / freeze /
//      unfreeze are the only three, and cancellation is `admin/subscriptions`
//      behind `BillingManage`. `member.membership.cancelNotice` is therefore a
//      STATUS LINE on the block above, with nothing beside it to press.
//
//   2. **Switch a live plan.** `POST /subscriptions` is enrol-only and answers
//      `409 ALREADY_SUBSCRIBED` while a membership is live. So the plan chooser
//      is offered only when there is no live plan; `member.membership.changePlan`
//      goes unread and `plan.errAlreadySubscribed` is rendered only as the
//      mutation's error branch. See `components/membership/plan-sheet.tsx`.
//
//   3. **List invoices.** There is no `GET /me/invoices`. The history arrives
//      *inside* `GET /me/subscription`, which is why the query key carries both.
//      It is rendered on `/profile/billing`, where `billing.invoices.*` (the
//      complete loading / error / empty / status set) lives; this screen links
//      there rather than growing a second invoice list that could disagree with
//      the first. `member.membership.invoices` and its column labels go unread
//      for that reason, and it is written down rather than left as a puzzle.
//
// ---------------------------------------------------------------------------
// AND ONE THING THAT MOVED HERE. Buying PT credits used to sit inline on
// `/profile/billing`; that screen is the invoice history now (T1.17), which left
// `POST /credit-packs/purchase` with no entry point on the phone and this
// screen's "Buy more" pushing to a Billing that no longer sold anything. The
// purchase is a sheet off the credits block — the block that already states the
// balance it changes. See `components/membership/credits-sheet.tsx`.
//
// ---------------------------------------------------------------------------
// ONE SHEET AT A TIME. `Sheet` is single-instance per screen — two overlapping
// `Modal`s flash black on iOS — and this screen can open three different ones,
// so it holds ONE `sheet: 'freeze' | 'plan' | 'credits' | null` rather than a
// boolean apiece. That is the pitfall `sheet.tsx`'s header names, as state.

import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AppBar,
  IconButton,
  ListRow,
  Screen,
  SectionHeader,
  Skeleton,
  Surface,
  Text,
  layout,
  spacing,
  useToast,
} from '@fit/ui-mobile';

import { OfflineNotice } from '../../../components/auth/notices';
import { useIsOnline } from '../../../components/auth/use-online';
import { HomeSection, sectionPhase } from '../../../components/home/section';
import {
  creditBalance,
  freezeAllowance,
  hasLivePlan,
  isFrozen,
} from '../../../components/membership/derive';
import { CreditsSheet } from '../../../components/membership/credits-sheet';
import { FreezeSheet } from '../../../components/membership/freeze-sheet';
import { ProfileMembershipCard } from '../../../components/membership/membership-card';
import { PlanSheet } from '../../../components/membership/plan-sheet';
import { formatMediumDate } from '../../../components/services/date-format';
import { useCreditPacks, useMembership } from '../../../hooks/queries/useMembership';
import { useUnfreezeSubscription } from '../../../hooks/mutations/useSubscriptionMutations';
import { useGymId } from '../../../hooks/useActiveGym';
import { queryKeys } from '../../../lib/query-keys';
import { useI18n } from '../../../providers/I18nProvider';

/** The one sheet this screen may have open. See the header. */
type OpenSheet = 'freeze' | 'plan' | 'credits' | null;

export default function MembershipScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const online = useIsOnline();
  const gymId = useGymId();
  const scoped = gymId ?? '';

  const [now] = useState(() => new Date());
  const [sheet, setSheet] = useState<OpenSheet>(null);

  const membership = useMembership();
  const packs = useCreditPacks();
  const unfreeze = useUnfreezeSubscription();

  const subscription = membership.data?.subscription ?? null;
  const live = hasLivePlan(subscription);
  const frozen = isFrozen(subscription);
  const allowance = freezeAllowance(subscription);
  const credits = useMemo(() => creditBalance(packs.data?.packs), [packs.data]);

  const invalidate = useCallback(
    (key: readonly unknown[]) => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
    [queryClient],
  );

  const resume = useCallback(() => {
    if (subscription === null || unfreeze.isPending) return;
    unfreeze.mutate(
      { subscriptionId: subscription.id },
      {
        onSuccess: () => {
          toast.success(t('member.membership.freeze.resumedToast'));
        },
        onError: () => {
          toast.error(t('member.membership.freeze.errGeneric'));
        },
      },
    );
  }, [subscription, unfreeze, toast, t]);

  const membershipPhase = sectionPhase(membership, online);
  const creditsPhase = sectionPhase(packs, online);

  return (
    <Screen
      testID="membership-screen"
      header={
        <AppBar
          eyebrow={t('member.membership.eyebrow')}
          // The screen's title heading.
          title={t('member.membership.title')}
          leading={
            <IconButton
              icon="chevronLeft"
              accessibilityLabel={t('notifications.back')}
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/profile');
              }}
              variant="surface"
              testID="membership-back"
            />
          }
        />
      }
    >
      <View style={{ gap: layout.sectionGap }}>
        {online ? null : <OfflineNotice testID="membership-offline" />}

        {/* ── The block ──────────────────────────────────────────────────── */}
        <HomeSection
          testID="membership-block"
          phase={membershipPhase}
          onRetry={() => {
            invalidate(queryKeys.membership(scoped));
          }}
          skeleton={<Skeleton height={230} radius="page" />}
        >
          {membership.data === undefined ? null : (
            <ProfileMembershipCard
              data={membership.data}
              now={now}
              busy={unfreeze.isPending}
              // No live plan ⇒ the only write available is enrolment. A live
              // plan ⇒ no primary button at all, because switching has no
              // member route (see the header).
              hideManageAction={live}
              manageLabel={t('member.membership.choosePlan')}
              // D10: this screen is `member.membership`, Profile is
              // `member.profile.mobile`. Both sets exist; the component takes
              // the strings so neither screen borrows the other's.
              emptyCopy={{
                title: t('member.membership.noPlan'),
                body: t('member.membership.noPlanHint'),
                action: t('member.membership.choosePlan'),
              }}
              onFreeze={() => {
                setSheet('freeze');
              }}
              onResume={resume}
              onManage={() => {
                setSheet('plan');
              }}
              testID="membership-card"
            />
          )}
        </HomeSection>

        {/* ── Payment trouble ────────────────────────────────────────────── */}
        {subscription?.status === 'PAST_DUE' ? (
          <Alert
            testID="membership-past-due"
            tone="danger"
            icon="info"
            title={t('member.membership.pastDue.title')}
            body={t('member.membership.pastDue.body')}
          />
        ) : null}

        {/* ── The facts ──────────────────────────────────────────────────── */}
        {subscription === null ? null : (
          <View style={{ gap: spacing[3] }} testID="membership-facts">
            <SectionHeader title={t('member.membership.thisPeriod')} size="md" />
            <Surface tone="card" padVertical={1}>
              <ListRow
                // "Next billing" while the plan renews, "Access until" once it
                // is set to lapse. Both are real keys and the distinction is
                // the one thing `cancelAtPeriodEnd` genuinely changes here.
                title={
                  subscription.cancelAtPeriodEnd
                    ? t('member.membership.endsOn')
                    : t('member.membership.nextBilling')
                }
                value={formatMediumDate(locale, subscription.currentPeriodEnd)}
                testID="membership-fact-period-end"
              />
              <ListRow
                title={t('member.membership.memberSince')}
                value={formatMediumDate(locale, subscription.memberSince)}
                testID="membership-fact-member-since"
              />
              <ListRow
                // Not a stored payment method — there is no card on file
                // anywhere in this API, and `member.membership.payAtDesk` is
                // the model the whole product runs on.
                title={t('member.membership.paymentMethod')}
                value={t('member.membership.payAtDesk')}
                testID="membership-fact-payment"
              />
            </Surface>
          </View>
        )}

        {/* ── Freeze ─────────────────────────────────────────────────────── */}
        {subscription === null ? null : (
          <View style={{ gap: spacing[3] }} testID="membership-freeze">
            <SectionHeader
              title={t('member.membership.freeze.title')}
              subtitle={t('member.membership.freeze.subtitle')}
              size="md"
            />
            <Surface tone="card" padding={5}>
              <View style={{ gap: spacing[3] }}>
                <Text variant="bodySmall" color="textSecondary" testID="membership-freeze-state">
                  {frozen
                    ? subscription.frozenUntil === null
                      ? t('member.membership.freeze.frozenHint')
                      : t('member.membership.freeze.frozenUntil', {
                          date: formatMediumDate(locale, subscription.frozenUntil),
                        })
                    : !allowance.offered
                      ? t('member.membership.freeze.notAvailable')
                      : !allowance.available
                        ? t('member.membership.freeze.exhausted')
                        : t('member.membership.freeze.remaining', { days: allowance.remaining })}
                </Text>
                {allowance.offered ? (
                  <Text variant="caption" color="textSecondary">
                    {t('member.membership.freeze.used', {
                      used: allowance.used,
                      total: allowance.perPeriod,
                    })}
                  </Text>
                ) : null}
              </View>
            </Surface>
          </View>
        )}

        {/* ── PT credits ─────────────────────────────────────────────────── */}
        <HomeSection
          testID="membership-credits"
          title={t('member.membership.credits.title')}
          action={{
            label: t('member.membership.credits.buyMore'),
            onPress: () => {
              setSheet('credits');
            },
            testID: 'membership-credits-buy',
          }}
          phase={creditsPhase}
          onRetry={() => {
            invalidate(queryKeys.creditPacks(scoped));
          }}
          skeleton={<Skeleton height={72} radius={22} />}
        >
          <Surface tone="card" padVertical={1}>
            <ListRow
              title={t('member.membership.ptCredits')}
              value={
                credits.total > 0
                  ? `${String(credits.remaining)}/${String(credits.total)}`
                  : String(credits.remaining)
              }
              testID="membership-credit-balance"
            />
          </Surface>
        </HomeSection>

        {/* ── Invoices live on Billing ───────────────────────────────────── */}
        <Surface tone="card" padVertical={1}>
          <ListRow
            icon="card"
            title={t('member.membership.invoices')}
            hint={t('billing.subtitle')}
            onPress={() => {
              router.push('/profile/billing');
            }}
            testID="membership-invoices-link"
          />
        </Surface>
      </View>

      <FreezeSheet
        open={sheet === 'freeze'}
        onClose={() => {
          setSheet(null);
        }}
        subscription={subscription}
        now={now}
      />
      <PlanSheet
        open={sheet === 'plan'}
        onClose={() => {
          setSheet(null);
          // The chooser's own error branch closes the sheet rather than
          // retrying in place — it holds no key of its own. Invalidating here
          // is what makes reopening it a fresh read.
          invalidate(queryKeys.catalogue(scoped));
        }}
        currentPlanName={subscription?.planName ?? null}
      />
      <CreditsSheet
        open={sheet === 'credits'}
        onClose={() => {
          setSheet(null);
          // Same reason as the chooser above: the sheet holds no key, so its
          // error branch closes and the refresh happens here. A purchase has
          // already invalidated both roots through the mutation matrix.
          invalidate(queryKeys.packCatalogue(scoped));
        }}
      />
    </Screen>
  );
}
