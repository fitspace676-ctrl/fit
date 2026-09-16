// @fit/mobile — `409 PRICE_CHANGED`, on screen.
//
// ===========================================================================
// WHY THIS SHEET EXISTS AND WHY IT MUST NEVER AUTO-RETRY.
//
// `POST /cart/checkout` answers 409 by hand (`res.status(409)` and a normal
// return, so the exception filter cannot flatten `newPrices` away), and — the
// part that makes this dangerous — **the server has already re-priced the
// cart**. An immediate, identical retry therefore SUCCEEDS.
//
// That is precisely the trap. Retrying on the member's behalf charges a price
// they never saw, on the one screen where the number is the whole point. So the
// deltas go on screen and the second press comes from a finger.
//
// The old price is read from a SNAPSHOT taken just before the checkout fired,
// not from the cart cache: the mutation's `onSuccess` invalidates the cart on a
// 409 (`invalidateFor(…, 'checkoutCartPriceChanged')`), so by the time this
// renders the cache is being refetched to the NEW prices and would show "was X,
// now X".
// ===========================================================================

import { Alert, Button, ListRow, Sheet, Surface, spacing } from '@fit/ui-mobile';
import { View } from 'react-native';
import type { CartPriceChange, CartView } from '@fit/types';

import { useI18n } from '../../providers/I18nProvider';
import { useMoney } from './money';
import { SHOP_PENDING_COPY, pendingPriceWas } from './pending-copy';

export interface PriceChangedSheetProps {
  open: boolean;
  onClose: () => void;
  /** Re-fire the IDENTICAL checkout. Only ever from a press. */
  onConfirm: () => void;
  /** The checkout is in flight again. */
  busy: boolean;
  /**
   * The RETRY from this sheet failed.
   *
   * ===========================================================================
   * A FAILURE RENDERED UNDER A MODAL IS A FAILURE NOBODY SEES.
   *
   * `Sheet` is a native `Modal` (`packages/ui-mobile/src/feedback/sheet.tsx`),
   * so the cart's own `cart-checkout-error` alert — which lives in the scroll
   * body — is drawn UNDERNEATH this. The member confirms the new prices, the
   * request fails, the sheet stays open with a re-enabled button, and the only
   * thing that says anything went wrong is behind the sheet. Pressing again
   * looks like the only option, on the one screen that takes money.
   *
   * So the sentence has to be inside the modal that covers it.
   */
  failed: boolean;
  /** The server's new per-unit prices, by variant reference. */
  changes: readonly CartPriceChange[];
  /**
   * The cart as it was when checkout was pressed — the only remaining source of
   * the OLD price and of each line's product name. See the header.
   */
  snapshot: CartView | null;
  testID?: string;
}

/** The 409 review sheet: old price, new price, and a deliberate second press. */
export function PriceChangedSheet({
  open,
  onClose,
  onConfirm,
  busy,
  failed,
  changes,
  snapshot,
  testID = 'cart-price-changed',
}: PriceChangedSheetProps) {
  const { t } = useI18n();
  const money = useMoney();
  const currency = snapshot?.currency ?? '';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      testID={testID}
      title={t('member.cart.errPrice')}
      // TODO(i18n): `member.shop.cart.priceChangedBody`.
      subtitle={SHOP_PENDING_COPY.priceChangedBody}
      closeAccessibilityLabel={t('member.shop.cart.back')}
      footer={
        <>
          <Button
            label={t('member.shop.checkout.place')}
            busyLabel={t('member.shop.checkout.processing')}
            busy={busy}
            variant="primary"
            size="lg"
            onPress={onConfirm}
            testID={`${testID}-confirm`}
            style={{ flexGrow: 1, flexBasis: 0 }}
          />
          <Button
            label={t('member.shop.cart.back')}
            variant="ghost"
            size="lg"
            onPress={onClose}
            testID={`${testID}-cancel`}
            style={{ flexGrow: 1, flexBasis: 0 }}
          />
        </>
      }
    >
      <View style={{ gap: spacing[3] }}>
        {failed ? (
          <Alert
            testID={`${testID}-failed`}
            tone="danger"
            live
            title={t('member.shop.checkout.error')}
          />
        ) : null}

        <Surface tone="quiet" padVertical={1}>
          {changes.map((change) => {
            const line = snapshot?.items.find((item) => item.variantId === change.variantId);
            const name = line?.productName ?? change.variantId;
            const next = money.format(change.priceAmount, line?.currency ?? currency);
            return (
              <ListRow
                key={change.variantId}
                title={name}
                // TODO(i18n): `member.shop.cart.priceWas`, as t('…', { price }).
                hint={
                  line === undefined
                    ? undefined
                    : pendingPriceWas(money.format(line.unitPrice, line.currency))
                }
                value={next}
                chevron={false}
                testID={`${testID}-row`}
              />
            );
          })}
        </Surface>
      </View>
    </Sheet>
  );
}
