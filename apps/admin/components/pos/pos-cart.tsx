'use client';

import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { formatPrice, inputToMinor, minorToInput } from '@/app/(dashboard)/shop/format-price';
import { Btn } from '@/components/ui';
import {
  lineTotal,
  selectDiscountTotal,
  selectItemCount,
  selectSubtotal,
  selectTotal,
  usePosCart,
} from '@/stores/pos-cart-store';

const styles = stylex.create({
  root: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '0.5rem',
  },
  heading: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  clearBtn: {
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.5rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
    cursor: 'pointer',
  },
  scrollArea: {
    minHeight: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflowY: 'auto',
  },
  empty: {
    margin: 0,
    paddingBlock: '2.5rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  lineList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  line: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    padding: '0.75rem',
  },
  lineHead: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  lineInfo: {
    minWidth: 0,
  },
  lineName: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  lineEach: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  removeBtn: {
    flexShrink: 0,
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.5rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-error)',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
    cursor: 'pointer',
  },
  lineControls: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  stepper: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
  },
  stepBtn: {
    borderWidth: 0,
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
    paddingInline: '0.75rem',
    paddingBlock: '0.25rem',
    fontSize: '1.125rem',
    lineHeight: 1,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  qtyInput: {
    width: '3rem',
    borderBlockWidth: 0,
    borderInlineWidth: '1px',
    borderInlineStyle: 'solid',
    borderInlineColor: 'var(--color-border)',
    backgroundColor: 'transparent',
    paddingBlock: '0.25rem',
    paddingInline: 0,
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
  },
  discountLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  discountInput: {
    width: '5rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.5rem',
    paddingBlock: '0.25rem',
    textAlign: 'right',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
    boxShadow: {
      default: 'none',
      ':focus': '0 0 0 4px color-mix(in srgb, var(--color-accent) 20%, transparent)',
    },
    '::placeholder': {
      color: 'var(--color-text-secondary)',
    },
  },
  lineTotal: {
    marginLeft: 'auto',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },

  // CartSummary.
  summary: {
    marginTop: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingTop: '0.75rem',
  },
  cartDiscountLabel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  cartDiscountInput: {
    width: '6rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.5rem',
    paddingBlock: '0.25rem',
    textAlign: 'right',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
    boxShadow: {
      default: 'none',
      ':focus': '0 0 0 4px color-mix(in srgb, var(--color-accent) 20%, transparent)',
    },
    '::placeholder': {
      color: 'var(--color-text-secondary)',
    },
  },
  summaryRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  totalRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  amount: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  chargeBtn: {
    marginTop: '0.25rem',
    width: '100%',
  },
});

/** The cart's working currency — the first line's currency, or USD when empty. */
function useCartCurrency(): string {
  return usePosCart((state) => state.items[0]?.currency ?? 'USD');
}

/**
 * The POS cart (right column, below the member lookup). Renders each line with a
 * quantity stepper, a per-line discount field, and a remove control; below the
 * lines sit a cart-level discount field and the live subtotal / discount / total
 * summary. Every value is read from the in-memory Zustand store with a selector so
 * a single line edit doesn't repaint the whole list.
 */
export function PosCart({ onCharge }: { onCharge: () => void }) {
  const t = useTranslations('admin.pos.cart');
  const items = usePosCart((state) => state.items);
  const currency = useCartCurrency();
  const itemCount = usePosCart(selectItemCount);
  const setQty = usePosCart((state) => state.setQty);
  const removeItem = usePosCart((state) => state.removeItem);
  const setLineDiscount = usePosCart((state) => state.setLineDiscount);
  const clear = usePosCart((state) => state.clear);

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.heading)}>
          {itemCount > 0 ? t('headingCount', { count: itemCount }) : t('heading')}
        </h2>
        {items.length > 0 ? (
          <button type="button" onClick={clear} {...stylex.props(styles.clearBtn)}>
            {t('clear')}
          </button>
        ) : null}
      </div>

      <div {...stylex.props(styles.scrollArea)}>
        {items.length === 0 ? (
          <p {...stylex.props(styles.empty)}>{t('empty')}</p>
        ) : (
          <ul {...stylex.props(styles.lineList)}>
            {items.map((item) => (
              <li key={item.productId} {...stylex.props(styles.line)}>
                <div {...stylex.props(styles.lineHead)}>
                  <div {...stylex.props(styles.lineInfo)}>
                    <p {...stylex.props(styles.lineName)}>{item.name}</p>
                    <p {...stylex.props(styles.lineEach)}>
                      {t('each', { price: formatPrice(item.unitPrice, item.currency) })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.productId)}
                    aria-label={t('removeItem', { name: item.name })}
                    {...stylex.props(styles.removeBtn)}
                  >
                    {t('remove')}
                  </button>
                </div>

                <div {...stylex.props(styles.lineControls)}>
                  <div {...stylex.props(styles.stepper)}>
                    <button
                      type="button"
                      onClick={() => setQty(item.productId, item.qty - 1)}
                      aria-label={t('decrease', { name: item.name })}
                      {...stylex.props(styles.stepBtn)}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={(event) =>
                        setQty(item.productId, Math.trunc(Number(event.target.value)))
                      }
                      aria-label={t('quantity', { name: item.name })}
                      {...stylex.props(styles.qtyInput)}
                    />
                    <button
                      type="button"
                      onClick={() => setQty(item.productId, item.qty + 1)}
                      aria-label={t('increase', { name: item.name })}
                      {...stylex.props(styles.stepBtn)}
                    >
                      +
                    </button>
                  </div>

                  <label {...stylex.props(styles.discountLabel)}>
                    {t('discountShort')}
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={item.lineDiscount > 0 ? minorToInput(item.lineDiscount) : ''}
                      onChange={(event) =>
                        setLineDiscount(item.productId, inputToMinor(event.target.value) ?? 0)
                      }
                      placeholder="0.00"
                      aria-label={t('lineDiscountLabel', { name: item.name })}
                      {...stylex.props(styles.discountInput)}
                    />
                  </label>

                  <span {...stylex.props(styles.lineTotal)}>
                    {formatPrice(lineTotal(item), item.currency)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CartSummary currency={currency} onCharge={onCharge} />
    </div>
  );
}

/** The discount field + subtotal / discount / total totals pinned to the cart's foot. */
function CartSummary({ currency, onCharge }: { currency: string; onCharge: () => void }) {
  const t = useTranslations('admin.pos.cart');
  const subtotal = usePosCart(selectSubtotal);
  const discountTotal = usePosCart(selectDiscountTotal);
  const total = usePosCart(selectTotal);
  const cartDiscount = usePosCart((state) => state.cartDiscount);
  const setCartDiscount = usePosCart((state) => state.setCartDiscount);

  return (
    <div {...stylex.props(styles.summary)}>
      <label {...stylex.props(styles.cartDiscountLabel)}>
        <span>{t('cartDiscount')}</span>
        <input
          type="number"
          min={0}
          step="0.01"
          defaultValue={cartDiscount > 0 ? minorToInput(cartDiscount) : ''}
          onChange={(event) => setCartDiscount(inputToMinor(event.target.value) ?? 0)}
          placeholder="0.00"
          aria-label={t('cartDiscountLabel')}
          {...stylex.props(styles.cartDiscountInput)}
        />
      </label>

      <div {...stylex.props(styles.summaryRow)}>
        <span>{t('subtotal')}</span>
        <span {...stylex.props(styles.amount)}>{formatPrice(subtotal, currency)}</span>
      </div>
      <div {...stylex.props(styles.summaryRow)}>
        <span>{t('discounts')}</span>
        <span {...stylex.props(styles.amount)}>−{formatPrice(discountTotal, currency)}</span>
      </div>
      <div {...stylex.props(styles.totalRow)}>
        <span>{t('total')}</span>
        <span {...stylex.props(styles.amount)}>{formatPrice(total, currency)}</span>
      </div>

      <Btn
        v="primary"
        size="lg"
        onClick={onCharge}
        disabled={total <= 0}
        {...stylex.props(styles.chargeBtn)}
      >
        {t('charge', { total: formatPrice(total, currency) })}
      </Btn>
    </div>
  );
}
