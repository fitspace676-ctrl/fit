// Plans are bought through POST /checkout. Flitt approval activates the period;
// the next period is purchased manually. A live plan cannot be switched here.

import { useOnlinePayments } from '../../hooks/useOnlinePayments';
import { usePaymentBrowser } from '../../hooks/usePaymentBrowser';
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

import { useCreateCheckout } from '../../hooks/mutations/useCheckoutMutations';
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
  const payments = useOnlinePayments();
  const openPayment = usePaymentBrowser();
  const catalogue = useCatalogue();
  const enroll = useCreateCheckout();

  const [selected, setSelected] = useState<string | null>(null);

  const plans = catalogue.data?.subscriptionPlans ?? [];
  const chosen = plans.find((plan) => plan.id === selected) ?? null;

  function confirm() {
    if (!payments.enabled || chosen === null || enroll.isPending) return;
    enroll.mutate(
      { productType: 'subscription', productId: chosen.id },
      {
        onSuccess: async (result) => {
          if (result.payment?.status === 'requires_action') {
            onClose();
            await openPayment(result.payment);
            return;
          }
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
      subtitle={t('member.payment.planBody')}
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
            disabled={!payments.enabled || chosen === null}
            busy={enroll.isPending}
            busyLabel={t('member.membership.plan.working')}
            onPress={confirm}
          />
        )
      }
    >
      <View style={{ gap: spacing[2] }}>
        {!payments.enabled ? <Text>{t('member.payment.frontDesk')}</Text> : null}
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
