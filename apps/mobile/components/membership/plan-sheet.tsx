// @fit/mobile — choosing a plan. `member.membership.plan` (28 keys).
//
// ===========================================================================
// THIS SHEET ENROLS. IT DOES NOT SWITCH, AND IT CANNOT.
//
// `POST /subscriptions` is the only member-callable subscription write besides
// freeze / unfreeze, and it answers `409 ALREADY_SUBSCRIBED` while a membership
// is live — one live membership per member per gym. Switching a live plan is
// `admin/subscriptions`, behind `BillingManage`, which a `MEMBER` token does
// not hold. So:
//
//   * a member with **no** live plan gets this sheet, and the confirm button
//     enrols them (`member.membership.plan.start`);
//   * a member **with** a live plan is never shown the sheet at all — the
//     membership screen drops the button rather than offering one whose only
//     possible outcome is `errAlreadySubscribed`.
//
// The catalogue already knew: `member.membership.plan.errAlreadySubscribed`
// reads "You already have a live membership. Cancel it first, or ask at the
// front desk to switch." That sentence is still rendered — as the error branch
// of the mutation, for the race where a plan is started on another device while
// this sheet is open — but it is not the normal path.
//
// ---------------------------------------------------------------------------
// WHERE THE PLANS COME FROM.
//
// `GET /catalogue`, the join funnel's public aggregate, whose
// `subscriptionPlans` array is the gym's on-sale plans. There is no
// member-scoped plan-listing route; the catalogue is `@Public()` precisely so a
// visitor can read it before they have a session, and a signed-in member reads
// the same thing. `member.membership.plan.subtitle` — "Pick the plan you want.
// You pay for it at the front desk." — is the payment model, and it is why
// there is no card form here.
//
// The price is formatted through `@fit/i18n`'s `createNumberFormat`; `Intl` is
// banned in this app and would answer en-US to a Georgian member.

import { useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  EmptyState,
  ListRow,
  Sheet,
  Skeleton,
  Text,
  spacing,
  useToast,
} from '@fit/ui-mobile';

import { useEnrollSubscription } from '../../hooks/mutations/useSubscriptionMutations';
import { useCatalogue } from '../../hooks/queries/useShop';
import { formatMoney } from '../services/money';
import { planErrorKey } from './plan-errors';
import { useI18n } from '../../providers/I18nProvider';

export interface PlanSheetProps {
  open: boolean;
  onClose: () => void;
  /** The id of the plan the member is already on, so it can be marked. */
  currentPlanName: string | null;
  testID?: string;
}

/** The plan chooser. */
export function PlanSheet({
  open,
  onClose,
  currentPlanName,
  testID = 'plan-sheet',
}: PlanSheetProps) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const catalogue = useCatalogue();
  const enroll = useEnrollSubscription();

  const [selected, setSelected] = useState<string | null>(null);

  const plans = catalogue.data?.subscriptionPlans ?? [];
  const chosen = plans.find((plan) => plan.id === selected) ?? null;

  function confirm() {
    if (chosen === null || enroll.isPending) return;
    enroll.mutate(
      { planId: chosen.id },
      {
        onSuccess: () => {
          toast.success(t('member.membership.plan.startedTitle'));
          onClose();
        },
        onError: (error: unknown) => {
          toast.error(t(planErrorKey(error)));
        },
      },
    );
  }

  return (
    <Sheet
      testID={testID}
      open={open}
      onClose={onClose}
      title={t('member.membership.choosePlan')}
      subtitle={t('member.membership.plan.subtitle')}
      closeAccessibilityLabel={t('member.membership.plan.cancel')}
      footer={
        plans.length === 0 ? undefined : (
          <Button
            testID={`${testID}-confirm`}
            label={
              chosen === null
                ? t('member.membership.choosePlan')
                : t('member.membership.plan.start', { plan: chosen.name })
            }
            fullWidth
            disabled={chosen === null}
            busy={enroll.isPending}
            busyLabel={t('member.membership.plan.working')}
            onPress={confirm}
          />
        )
      }
    >
      <View style={{ gap: spacing[2] }}>
        {catalogue.isPending && catalogue.data === undefined ? (
          <View
            testID={`${testID}-loading`}
            accessible
            accessibilityLabel={t('member.membership.plan.loading')}
            style={{ gap: spacing[2] }}
          >
            <Skeleton height={64} radius={22} />
            <Skeleton height={64} radius={22} />
          </View>
        ) : null}

        {catalogue.isError ? (
          <EmptyState
            testID={`${testID}-error`}
            icon="info"
            title={t('member.membership.plan.error')}
            action={{
              label: t('billing.retry'),
              onPress: () => {
                // The one place a screen-level refetch is not available: this
                // sheet holds no query key of its own. `useCatalogue`'s key is
                // `queryKeys.catalogue(gymId)` and the membership screen
                // invalidates it — see `membership.tsx`'s `retryCatalogue`.
                onClose();
              },
              variant: 'secondary',
              testID: `${testID}-retry`,
            }}
          />
        ) : null}

        {!catalogue.isPending && !catalogue.isError && plans.length === 0 ? (
          <EmptyState
            testID={`${testID}-empty`}
            icon="card"
            title={t('member.membership.plan.none')}
            body={t('member.membership.plan.noneHint')}
          />
        ) : null}

        {plans.map((plan) => {
          const isCurrent = currentPlanName !== null && plan.name === currentPlanName;
          const price = `${formatMoney(plan.priceAmount, plan.currency, locale)}${
            plan.interval === 'YEAR'
              ? t('member.membership.plan.perYear')
              : t('member.membership.plan.perMonth')
          }`;
          return (
            <ListRow
              key={plan.id}
              testID={`${testID}-plan-${plan.id}`}
              title={plan.name}
              hint={plan.description === '' ? price : `${price} · ${plan.description}`}
              value={isCurrent ? t('member.membership.plan.current') : undefined}
              icon={selected === plan.id ? 'check' : 'card'}
              onPress={() => {
                setSelected(plan.id);
              }}
              accessibilityLabel={`${plan.name}, ${price}${
                isCurrent ? `, ${t('member.membership.plan.keep')}` : ''
              }`}
            />
          );
        })}

        <Text variant="caption" color="textSecondary">
          {t('member.membership.plan.subtitle')}
        </Text>
      </View>
    </Sheet>
  );
}
