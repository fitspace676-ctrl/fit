// @fit/mobile — one product in the shop list.
//
// ===========================================================================
// THE 0 → 1 SWAP IS THIS FILE'S JOB, NOT `QtyStepper`'s.
//
// The artboard (`mobile-shop.tsx:186-211`) draws a 44pt round lime "+" while a
// product is not in the cart and the pill stepper once it is. `QtyStepper`'s
// own header says why it refuses to do that itself: "a component that renders
// itself as a different component is a component nobody can reason about". So
// the swap lives here, on the screen side of the package line.
// ===========================================================================
//
// THREE TRAILING CONTROLS, AND WHICH ONE APPEARS IS ARITHMETIC:
//
//   sold out              nothing — the meta line says so, and the row still
//                         opens the detail screen, because "why can't I buy
//                         this" is a question the detail screen answers.
//   2+ variants           a "+" that OPENS THE DETAIL rather than adding. The
//                         client cannot know which option the member wanted,
//                         and picking one for them is a wrong line in a cart.
//   in the cart           the stepper, at `min: 0` with `removeAtMin`, so one
//                         press past 1 shows a bin and removes the line —
//                         never a `qty: 0` PATCH, which `updateCartItemSchema`
//                         rejects (`qty >= 1`).
//
// ADD-TO-CART IS NOT OPTIMISTIC and this component is where that is visible: a
// `Spinner` replaces the "+" for the round trip. The client does not know the
// server's `unitPrice`, does not know `available`, and — decisively — does not
// know whether the variant merges into an existing line. Fabricating a line
// renders money that is a guess for 200ms, and a wrong number that corrects
// itself is worse than a spinner, because the buyer read it.

import { IconButton, ProductRow, QtyStepper, Spinner, spacing } from '@fit/ui-mobile';
import { MAX_CART_LINE_QUANTITY, type ProductSummary } from '@fit/types';
import { View } from 'react-native';

import { useI18n } from '../../providers/I18nProvider';
import {
  hasPriceRange,
  isSoldOut,
  lowestPrice,
  productInitial,
  singleVariantRef,
} from './catalogue';
import { useMoney } from './money';

/** The plate the artboard's add button and the row's touch floor share. */
const ADD_BUTTON = 44;

export interface CatalogueRowProps {
  product: ProductSummary;
  /** Units of this product's single variant already in the cart. */
  qty: number;
  /** An add for THIS row is in flight. */
  adding: boolean;
  /** Open the detail screen. */
  onOpen: () => void;
  /** Add one unit of {@link singleVariantRef}. Never called for a 2+ variant product. */
  onAdd: () => void;
  /** The stepper moved. `0` means remove the line. */
  onQty: (next: number) => void;
  testID: string;
}

/** A `ProductRow layout="catalogue"` wired to the cart. */
export function CatalogueRow({
  product,
  qty,
  adding,
  onOpen,
  onAdd,
  onQty,
  testID,
}: CatalogueRowProps) {
  const { t } = useI18n();
  const money = useMoney();

  const soldOut = isSoldOut(product);
  const ref = singleVariantRef(product);
  const amount = lowestPrice(product);
  const priced = money.format(amount, product.currency);
  const spoken = money.spoken(amount, product.currency);
  const range = hasPriceRange(product);

  return (
    <ProductRow
      testID={testID}
      layout="catalogue"
      name={product.name}
      initial={productInitial(product.name)}
      // The description, not a stock count: `GET /products` carries no stock
      // figure at all (see `catalogue.ts`), so the artboard's "· მარაგში 4"
      // tail has nothing behind it and is not invented here.
      meta={soldOut ? t('member.shop.soldOut') : product.description || undefined}
      price={range ? t('member.shop.from', { price: priced }) : priced}
      priceAccessibilityLabel={range ? t('member.shop.from', { price: spoken }) : spoken}
      onPress={onOpen}
      trailing={
        soldOut ? undefined : adding ? (
          <View
            style={{
              width: ADD_BUTTON,
              height: ADD_BUTTON,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Spinner accessibilityLabel={t('member.cart.adding')} testID={`${testID}-adding`} />
          </View>
        ) : qty > 0 ? (
          <QtyStepper
            value={qty}
            min={0}
            // A user gesture must never produce a 400. `MAX_CART_LINE_QUANTITY`
            // is the schema's own ceiling, so the "+" disables at 99 rather
            // than sending a body the server rejects.
            max={MAX_CART_LINE_QUANTITY}
            removeAtMin
            onChange={onQty}
            labels={{
              decrease: t('member.shop.cart.decrease'),
              increase: t('member.shop.cart.increase'),
              value: t('member.shop.detail.quantity'),
            }}
            testID={`${testID}-stepper`}
          />
        ) : (
          <IconButton
            icon="plus"
            variant="accent"
            size={ADD_BUTTON}
            // A 2+ variant product's "+" opens the chooser; a single-line
            // product's adds. Same glyph, because to the member it is the same
            // intent — the difference is only whether a choice is owed first.
            accessibilityLabel={t('member.shop.add')}
            onPress={ref === null ? onOpen : onAdd}
            testID={`${testID}-add`}
            style={{ marginLeft: spacing[0] }}
          />
        )
      }
    />
  );
}
