// @fit/mobile — one line of the cart.
//
// `ProductRow layout="line"`: no shell, a 56×56 monogram plate, and the unit
// price set as a quiet mono caption rather than as the lime the catalogue uses
// to sell (`mobile-shop.tsx:305`). The trailing slot holds BOTH controls the
// artboard draws — the `sm` stepper and the bin — which is why `ProductRow`
// narrows its own pressable region the moment it is given one: a button nested
// inside a button gives a screen-reader user two stops that do different things
// and no way to tell them apart.
//
// TWO THINGS HERE ARE CONTRACTS, NOT STYLING:
//
//   1. `removeAtMin` with `min: 0`. At a quantity of 1 the minus becomes a bin,
//      and pressing it calls back with `0` — which the screen turns into a
//      `DELETE /cart/items/:variantId`. It must never become a `PATCH {qty: 0}`:
//      `updateCartItemSchema` requires `qty >= 1`, so that is a 400 caused by
//      the member's own gesture.
//
//   2. `max: MAX_CART_LINE_QUANTITY`. The same rule at the other end — 99 is
//      the schema's ceiling, so the "+" disables there rather than sending a
//      body the server rejects.
//
// An UNAVAILABLE line is still drawn. `CartItemDetail.available` is `false` for
// a line that has gone out of stock while it sat in the cart; the server keeps
// it visible "so the buyer sees it" and removes it at checkout. Hiding it here
// would make the total drop with no explanation.

import { IconButton, ProductRow, QtyStepper, spacing } from '@fit/ui-mobile';
import { MAX_CART_LINE_QUANTITY, type CartItemDetail } from '@fit/types';
import { View } from 'react-native';

import { useI18n } from '../../providers/I18nProvider';
import { productInitial } from './catalogue';
import { useMoney } from './money';

export interface CartLineProps {
  item: CartItemDetail;
  /** The stepper moved. `0` means "remove this line". */
  onQty: (next: number) => void;
  onRemove: () => void;
  /** A write touching this line is in flight — both controls go inert. */
  busy?: boolean;
  testID: string;
}

/** A cart line: monogram, name, unit price, stepper, bin. */
export function CartLine({ item, onQty, onRemove, busy = false, testID }: CartLineProps) {
  const { t } = useI18n();
  const money = useMoney();

  const unit = money.format(item.unitPrice, item.currency);
  const spokenUnit = money.spoken(item.unitPrice, item.currency);

  return (
    <ProductRow
      testID={testID}
      layout="line"
      name={item.productName}
      initial={productInitial(item.productName)}
      meta={
        item.available
          ? (item.variantName ?? undefined)
          : // `member.shop` has no out-of-stock line label; `member.cart` does.
            t('member.cart.outOfStock')
      }
      price={t('member.shop.cart.each', { price: unit })}
      priceAccessibilityLabel={t('member.shop.cart.each', { price: spokenUnit })}
      trailing={
        <View
          // ==================================================================
          // 12, NOT 4 — AND THE NUMBER THAT MATTERS IS THE ONE YOU CANNOT SEE.
          //
          // The stepper's `sm` buttons and the ghost trash button are both 36pt
          // silhouettes, and `hitSlopFor` (correctly, unconditionally) grows
          // each of them to the 44pt floor — 4pt of slop per side. At `gap: 4`
          // the two slops met exactly: the delete target began on the same
          // point the stepper's ended, so a thumb aimed at "one fewer" that
          // landed a few points right REMOVED THE LINE, with no dead zone in
          // between and nothing on screen to suggest the controls were that
          // close. They looked 10pt apart and were 0.
          //
          // 12 leaves 4pt that belongs to neither control. That is the whole
          // fix: not a bigger gap for its own sake, a gap the slop cannot
          // cross.
          // ==================================================================
          testID={`${testID}-controls`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}
        >
          <QtyStepper
            size="sm"
            value={item.qty}
            min={0}
            max={MAX_CART_LINE_QUANTITY}
            removeAtMin
            disabled={busy}
            onChange={onQty}
            labels={{
              decrease: t('member.shop.cart.decrease'),
              increase: t('member.shop.cart.increase'),
              value: t('member.shop.detail.quantity'),
            }}
            testID={`${testID}-stepper`}
          />
          <IconButton
            icon="trash"
            variant="ghost"
            accessibilityLabel={t('member.shop.cart.remove')}
            disabled={busy}
            onPress={onRemove}
            testID={`${testID}-remove`}
          />
        </View>
      }
    />
  );
}
