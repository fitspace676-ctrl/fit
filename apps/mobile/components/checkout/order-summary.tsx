// @fit/mobile — "your selection", carried down the funnel.
//
// Web draws this as a sticky sidebar beside the wizard. A phone has no sidebar,
// so it becomes a card UNDER the step — visible on the three steps where the
// buyer is still choosing, and replaced on the payment step by that step's own
// itemised summary (`checkout.payment.summary.*`). Two summaries on one screen
// would be the same figure twice, and the second one would eventually disagree.
//
// `summary.note` is the front-desk sentence, and it is deliberately here rather
// than only on the payment step: a buyer deciding between a subscription and a
// package should know before they commit that no card is charged online. It is
// suppressed for the free account, which has nothing to pay for.

import { Divider, Eyebrow, Money, Surface, Text, spacing } from '@fit/ui-mobile';
import { View } from 'react-native';

import { useMoney } from '../shop/money';
import { useI18n } from '../../providers/I18nProvider';

export interface OrderSummaryProps {
  /** The chosen branch's name, or `undefined` while none is chosen. */
  branchName?: string;
  /** The chosen product's name, or `undefined`. */
  productName?: string;
  /** Minor units. `undefined` for the free account and for "nothing yet". */
  total?: number;
  currency?: string;
  /** The free account is chosen — show its price word, suppress the note. */
  freeLabel?: string;
  testID: string;
}

/** The running total, on the steps where it is still being assembled. */
export function OrderSummary({
  branchName,
  productName,
  total,
  currency,
  freeLabel,
  testID,
}: OrderSummaryProps) {
  const { t } = useI18n();
  const money = useMoney();

  const empty = branchName === undefined && productName === undefined && freeLabel === undefined;

  return (
    <Surface tone="card" padding={5} testID={testID}>
      <View style={{ gap: spacing[3] }}>
        {/* An `Eyebrow`, NOT a `SectionHeader`. This card appears on three of
            the four steps, and a `SectionHeader` emits
            `accessibilityRole="header"` — so the screen's ordered header list
            would gain a stray entry on every step, which is precisely what §6
            (as amended) asks that assertion to catch. */}
        <Eyebrow size="label" color="textSecondary">
          {t('checkout.summary.title')}
        </Eyebrow>

        {empty ? (
          <Text variant="bodySmall" color="textSecondary" testID={`${testID}-empty`}>
            {t('checkout.summary.empty')}
          </Text>
        ) : (
          <>
            {branchName === undefined ? null : (
              <Row label={t('checkout.summary.branch')} value={branchName} />
            )}
            {productName === undefined ? null : (
              <Row label={t('checkout.payment.summary.package')} value={productName} />
            )}

            <Divider />

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Eyebrow size="label" color="textSecondary">
                {t('checkout.summary.total')}
              </Eyebrow>
              {freeLabel === undefined ? (
                total === undefined || currency === undefined ? (
                  <Text variant="body" color="textSecondary" testID={`${testID}-total-pending`}>
                    {'—'}
                  </Text>
                ) : (
                  <Money
                    variant="monoLarge"
                    color="textPrimary"
                    accessibilityLabel={money.spoken(total, currency)}
                    testID={`${testID}-total`}
                  >
                    {money.format(total, currency)}
                  </Money>
                )
              ) : (
                <Text variant="bodyLarge" color="textPrimary" testID={`${testID}-total-free`}>
                  {freeLabel}
                </Text>
              )}
            </View>
          </>
        )}

        {/* No card is charged now — see `packages/types/src/signup.ts`, which
            records that there is no payment gateway yet (the T8.8 stub) and
            that reaching the checkout response means the purchase was
            RECORDED. The free account pays nothing, so the sentence would be
            answering a question it never asked. */}
        {freeLabel === undefined ? (
          <Text variant="caption" color="textSecondary" testID={`${testID}-note`}>
            {t('checkout.summary.note')}
          </Text>
        ) : null}
      </View>
    </Surface>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] }}>
      <Eyebrow size="label" color="textSecondary" style={{ flex: 1 }}>
        {label}
      </Eyebrow>
      <Text variant="body" color="textPrimary" align="right" style={{ flex: 2 }}>
        {value}
      </Text>
    </View>
  );
}
