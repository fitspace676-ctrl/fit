'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { PaymentMethod, PosReceipt } from '@fit/types';
import { formatPrice, inputToMinor, minorToInput } from '@/app/(dashboard)/products/format-price';
import {
  emailReceiptAction,
  recordPosSaleAction,
  type PosMemberRow,
} from '@/app/(dashboard)/pos/actions';
import { Card } from '@astryxdesign/core/Card';
import { Btn, Icon } from '@/components/ui';
import {
  lineTotal,
  selectChangeDue,
  selectDiscountTotal,
  selectItemCount,
  selectSubtotal,
  selectTotal,
  usePosCart,
} from '@/stores/pos-cart-store';

/** A finished sale, snapshotted at completion so the success screen survives the cart reset. */
interface CompletedSale {
  method: PaymentMethod;
  total: number;
  tendered: number;
  change: number;
  currency: string;
  itemCount: number;
  memberName: string | null;
  /** The member's address, pre-filled into the receipt field (`null` for a walk-in). */
  memberEmail: string | null;
  /** The validated sale snapshot the receipt email is rendered from. */
  receipt: PosReceipt;
}

/** The three settlement methods, keyed to the `admin.pos.payment.methods` copy. */
const METHODS: ReadonlyArray<{ method: PaymentMethod; labelKey: string; hintKey: string }> = [
  { method: 'cash', labelKey: 'methods.cash', hintKey: 'methods.cashHint' },
  { method: 'card', labelKey: 'methods.card', hintKey: 'methods.cardHint' },
  {
    method: 'member_account',
    labelKey: 'methods.memberAccount',
    hintKey: 'methods.memberAccountHint',
  },
];

/** Round-up suggestions offered as quick-tender chips, in minor units (5 / 10 / 20 / 50). */
const QUICK_TENDER_STEPS = [500, 1000, 2000, 5000];

const styles = stylex.create({
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    backgroundColor: 'rgba(9, 9, 11, 0.5)',
    backdropFilter: 'blur(4px)',
  },
  dialog: {
    display: 'flex',
    width: '100%',
    maxWidth: '28rem',
    flexDirection: 'column',
    gap: '1rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '1.25rem',
    boxShadow: '0 24px 60px -20px var(--color-shadow)',
    outline: 'none',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  titleTotal: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.5rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  methodGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '0.5rem',
  },
  methodBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    padding: '0.75rem',
    textAlign: 'center',
    transitionProperty: 'color, background-color, border-color, box-shadow',
    transitionDuration: '150ms',
    cursor: {
      default: 'pointer',
      ':disabled': 'not-allowed',
    },
    opacity: {
      default: 1,
      ':disabled': 0.4,
    },
  },
  methodBtnSelected: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
    boxShadow: '0 0 0 1px var(--color-accent)',
  },
  methodBtnIdle: {
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-border-emphasized)',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
  },
  methodLabel: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  methodHint: {
    fontSize: '0.6875rem',
    lineHeight: 1.25,
    color: 'var(--color-text-secondary)',
  },
  chargedTo: {
    margin: 0,
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-accent-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-accent)',
  },
  cashSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingTop: '0.75rem',
  },
  cashLabel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  cashInput: {
    width: '8rem',
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
    fontSize: '1rem',
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
  quickRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  quickBtn: {
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-accent)',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-accent-muted)',
    },
    paddingInline: '0.75rem',
    paddingBlock: '0.25rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
  },
  changeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '1rem',
  },
  changeLabel: {
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  changeValue: {
    fontFamily: 'var(--font-family-code)',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  changeValueShort: {
    color: 'var(--color-error)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  footer: {
    display: 'flex',
    gap: '0.5rem',
    paddingTop: '0.25rem',
  },
  flex1: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  flex2: {
    flexGrow: 2,
    flexShrink: 1,
    flexBasis: '0%',
  },

  // PaymentSuccess.
  successRoot: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    textAlign: 'center',
  },
  successHead: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
  },
  successDisc: {
    display: 'flex',
    height: '3rem',
    width: '3rem',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-success-muted)',
    color: 'var(--color-success)',
  },
  successDiscIcon: {
    width: '1.5rem',
    height: '1.5rem',
  },
  successTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  successSummary: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  successDl: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    margin: 0,
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    padding: '0.75rem',
    fontSize: '0.875rem',
  },
  successRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  successRowLg: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '1rem',
  },
  successDt: {
    margin: 0,
    color: 'var(--color-text-secondary)',
  },
  successDtStrong: {
    margin: 0,
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  successDd: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  successDdSemibold: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  successDdBold: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },

  // ReceiptSender.
  receipt: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingTop: '0.75rem',
    textAlign: 'left',
  },
  receiptHeading: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  receiptRow: {
    display: 'flex',
    gap: '0.5rem',
  },
  receiptInput: {
    height: '2.75rem',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.875rem',
    paddingBlock: 0,
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
  receiptSent: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-success)',
  },
  receiptNote: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  receiptError: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-error)',
  },
});

/**
 * The POS payment modal (T7.3). Opens from the cart's "Charge" button and walks
 * the operator through settling the sale: pick cash / card / member account, and
 * for cash enter the amount handed over to see the change due live. "Member
 * account" is only selectable when a member is attached (a walk-in has no account
 * to charge). Completing the sale snapshots a {@link CompletedSale} for the
 * confirmation screen, then `onCompleted` lets the board reset the cart.
 *
 * The confirmation screen offers to email the customer a receipt (T7.4) — the
 * snapshot is sent to `POST /orders/receipt`, which renders + delivers it. The
 * settlement itself is still recorded client-side; persisting an Order + Payment
 * row and the end-of-day reconciliation (T7.5) build on the same snapshot.
 */
export function PosPayment({
  member,
  onClose,
  onCompleted,
}: {
  member: PosMemberRow | null;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const t = useTranslations('admin.pos.payment');
  const items = usePosCart((state) => state.items);
  const total = usePosCart(selectTotal);
  const subtotal = usePosCart(selectSubtotal);
  const discountTotal = usePosCart(selectDiscountTotal);
  const changeDue = usePosCart(selectChangeDue);
  const itemCount = usePosCart(selectItemCount);
  const currency = usePosCart((state) => state.items[0]?.currency ?? 'USD');
  const method = usePosCart((state) => state.paymentMethod);
  const cashTendered = usePosCart((state) => state.cashTendered);
  const setPaymentMethod = usePosCart((state) => state.setPaymentMethod);
  const setCashTendered = usePosCart((state) => state.setCashTendered);

  const [completed, setCompleted] = useState<CompletedSale | null>(null);
  // Persisting the sale (T7.5) is the source of truth for the end-of-day
  // reconciliation, so completion blocks on it: `saving` while it is in flight,
  // an error string to surface (and let the operator retry) on failure.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog on open so keyboard operators land inside it.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const cashShort = method === 'cash' && cashTendered < total;
  const canComplete =
    total > 0 &&
    method !== null &&
    !cashShort &&
    !(method === 'member_account' && member === null) &&
    !saving;

  const quickTenders = useMemo(() => {
    const suggestions = new Set<number>([total]);
    for (const step of QUICK_TENDER_STEPS) {
      suggestions.add(Math.ceil(total / step) * step);
    }
    return [...suggestions].filter((amount) => amount >= total).sort((a, b) => a - b);
  }, [total]);

  async function complete(): Promise<void> {
    if (method === null || !canComplete) {
      return;
    }
    const tendered = method === 'cash' ? cashTendered : total;
    const change = method === 'cash' ? changeDue : 0;
    const receipt: PosReceipt = {
      currency,
      items: items.map((item) => ({
        name: item.name,
        quantity: item.qty,
        unitPrice: item.unitPrice,
        amount: lineTotal(item),
      })),
      subtotal,
      discountTotal,
      total,
      paymentMethod: method,
      cashTendered: tendered,
      changeDue: change,
      memberName: member?.name ?? null,
    };

    setSaving(true);
    setSaveError(null);
    const result = await recordPosSaleAction({ memberId: member?.id ?? null, receipt });
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error);
      return;
    }

    setCompleted({
      method,
      total,
      tendered,
      change,
      currency,
      itemCount,
      memberName: member?.name ?? null,
      memberEmail: member?.email ?? null,
      receipt,
    });
  }

  function finish(): void {
    onCompleted();
    onClose();
  }

  return (
    <div {...stylex.props(styles.overlay)} onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        {...stylex.props(styles.dialog)}
      >
        {completed ? (
          <PaymentSuccess sale={completed} onFinish={finish} />
        ) : (
          <>
            <div {...stylex.props(styles.titleRow)}>
              <h2 {...stylex.props(styles.title)}>{t('title')}</h2>
              <span {...stylex.props(styles.titleTotal)}>{formatPrice(total, currency)}</span>
            </div>

            <div {...stylex.props(styles.methodGrid)}>
              {METHODS.map(({ method: value, labelKey, hintKey }) => {
                const disabled = value === 'member_account' && member === null;
                const selected = method === value;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() => setPaymentMethod(value)}
                    {...stylex.props(
                      styles.methodBtn,
                      selected ? styles.methodBtnSelected : styles.methodBtnIdle,
                    )}
                  >
                    <span {...stylex.props(styles.methodLabel)}>{t(labelKey)}</span>
                    <span {...stylex.props(styles.methodHint)}>{t(hintKey)}</span>
                  </button>
                );
              })}
            </div>

            {method === 'member_account' && member !== null ? (
              <p {...stylex.props(styles.chargedTo)}>{t('chargedTo', { name: member.name })}</p>
            ) : null}

            {method === 'cash' ? (
              <div {...stylex.props(styles.cashSection)}>
                <label {...stylex.props(styles.cashLabel)}>
                  <span>{t('cashReceived')}</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    autoFocus
                    value={cashTendered > 0 ? minorToInput(cashTendered) : ''}
                    onChange={(event) => setCashTendered(inputToMinor(event.target.value) ?? 0)}
                    placeholder="0.00"
                    aria-label={t('cashReceived')}
                    {...stylex.props(styles.cashInput)}
                  />
                </label>

                <div {...stylex.props(styles.quickRow)}>
                  {quickTenders.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setCashTendered(amount)}
                      {...stylex.props(styles.quickBtn)}
                    >
                      {amount === total ? t('exact') : formatPrice(amount, currency)}
                    </button>
                  ))}
                </div>

                <div {...stylex.props(styles.changeRow)}>
                  <span {...stylex.props(styles.changeLabel)}>
                    {cashShort ? t('stillOwed') : t('changeDue')}
                  </span>
                  <span {...stylex.props(styles.changeValue, cashShort && styles.changeValueShort)}>
                    {formatPrice(cashShort ? total - cashTendered : changeDue, currency)}
                  </span>
                </div>
              </div>
            ) : null}

            {saveError !== null ? (
              <Card variant="default" padding={0} role="alert" xstyle={styles.errorCard}>
                <Icon name="info" {...stylex.props(styles.errorIcon)} />
                <span {...stylex.props(styles.errorText)}>
                  {t('recordError', { error: saveError })}
                </span>
              </Card>
            ) : null}

            <div {...stylex.props(styles.footer)}>
              <Btn v="outline" size="md" onClick={onClose} {...stylex.props(styles.flex1)}>
                {t('cancel')}
              </Btn>
              <Btn
                v="primary"
                size="md"
                onClick={() => void complete()}
                disabled={!canComplete}
                {...stylex.props(styles.flex2)}
              >
                {saving ? t('recording') : t('complete')}
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The post-completion confirmation: what was settled, plus change owed for cash. */
function PaymentSuccess({ sale, onFinish }: { sale: CompletedSale; onFinish: () => void }) {
  const t = useTranslations('admin.pos.payment');
  const labelKey = METHODS.find((entry) => entry.method === sale.method)?.labelKey;
  const methodLabel = labelKey ? t(labelKey) : sale.method;
  const summary = sale.memberName
    ? t('success.summaryMember', {
        count: sale.itemCount,
        method: methodLabel,
        member: sale.memberName,
      })
    : t('success.summary', { count: sale.itemCount, method: methodLabel });

  return (
    <div {...stylex.props(styles.successRoot)}>
      <div {...stylex.props(styles.successHead)}>
        <div {...stylex.props(styles.successDisc)}>
          <Icon name="check" {...stylex.props(styles.successDiscIcon)} sw={2.5} />
        </div>
        <h2 {...stylex.props(styles.successTitle)}>{t('success.title')}</h2>
        <p {...stylex.props(styles.successSummary)}>{summary}</p>
      </div>

      <dl {...stylex.props(styles.successDl)}>
        <div {...stylex.props(styles.successRow)}>
          <dt {...stylex.props(styles.successDt)}>{t('success.totalPaid')}</dt>
          <dd {...stylex.props(styles.successDdSemibold)}>
            {formatPrice(sale.total, sale.currency)}
          </dd>
        </div>
        {sale.method === 'cash' ? (
          <>
            <div {...stylex.props(styles.successRow)}>
              <dt {...stylex.props(styles.successDt)}>{t('success.cashReceived')}</dt>
              <dd {...stylex.props(styles.successDd)}>
                {formatPrice(sale.tendered, sale.currency)}
              </dd>
            </div>
            <div {...stylex.props(styles.successRowLg)}>
              <dt {...stylex.props(styles.successDtStrong)}>{t('success.changeDue')}</dt>
              <dd {...stylex.props(styles.successDdBold)}>
                {formatPrice(sale.change, sale.currency)}
              </dd>
            </div>
          </>
        ) : null}
      </dl>

      <ReceiptSender sale={sale} />

      <Btn v="primary" size="md" onClick={onFinish}>
        {t('success.newSale')}
      </Btn>
    </div>
  );
}

/** What the receipt send is currently doing — drives the inline status copy. */
type SendStatus =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'unconfigured' }
  | { kind: 'error'; message: string };

/**
 * The "Email receipt" control on the success screen: an address field (pre-filled
 * with the attached member's email) and a send button. Delegates to
 * {@link emailReceiptAction}; a `delivered:false` (email unconfigured server-side)
 * is reported as a soft note rather than an error, since the sale still completed.
 */
function ReceiptSender({ sale }: { sale: CompletedSale }) {
  const t = useTranslations('admin.pos.payment.receipt');
  const [email, setEmail] = useState(sale.memberEmail ?? '');
  const [status, setStatus] = useState<SendStatus>({ kind: 'idle' });

  const trimmed = email.trim();
  const canSend = trimmed !== '' && status.kind !== 'sending';

  async function send(): Promise<void> {
    if (!canSend) {
      return;
    }
    setStatus({ kind: 'sending' });
    const result = await emailReceiptAction({ email: trimmed, receipt: sale.receipt });
    if (!result.ok) {
      setStatus({ kind: 'error', message: result.error });
      return;
    }
    setStatus(result.data.delivered ? { kind: 'sent' } : { kind: 'unconfigured' });
  }

  return (
    <div {...stylex.props(styles.receipt)}>
      <span {...stylex.props(styles.receiptHeading)}>{t('heading')}</span>
      <div {...stylex.props(styles.receiptRow)}>
        <input
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (status.kind !== 'idle' && status.kind !== 'sending') {
              setStatus({ kind: 'idle' });
            }
          }}
          placeholder={t('placeholder')}
          aria-label={t('label')}
          {...stylex.props(styles.receiptInput)}
        />
        <Btn v="outline" size="md" onClick={() => void send()} disabled={!canSend}>
          {status.kind === 'sending' ? t('sending') : t('send')}
        </Btn>
      </div>
      {status.kind === 'sent' ? (
        <p {...stylex.props(styles.receiptSent)}>{t('sent', { email: trimmed })}</p>
      ) : null}
      {status.kind === 'unconfigured' ? (
        <p {...stylex.props(styles.receiptNote)}>{t('unconfigured')}</p>
      ) : null}
      {status.kind === 'error' ? (
        <p {...stylex.props(styles.receiptError)}>{status.message}</p>
      ) : null}
    </div>
  );
}
