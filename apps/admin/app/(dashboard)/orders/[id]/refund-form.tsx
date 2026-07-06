'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Btn } from '@/components/ui';
import { formatMoney } from '../format';
import { refundOrderAction } from './actions';

/** Minor units per major unit (USD/EUR/GEL — all two-decimal). */
const MINOR_PER_MAJOR = 100;

const styles = stylex.create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  fieldCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  label: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  input: {
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.875rem',
    paddingBlock: '0.625rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
  },
  amountInput: {
    width: '10rem',
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  textarea: {
    width: '100%',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
  },
  checkbox: {
    height: '1rem',
    width: '1rem',
    accentColor: 'var(--color-accent)',
  },
  errorMsg: {
    margin: 0,
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  successMsg: {
    margin: 0,
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-success)',
    backgroundColor: 'var(--color-success-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-success)',
  },
});

/**
 * The refund control on the order detail page (T7.9). Shown only to `BillingManage`
 * staff and only while the order still has a refundable balance. Collects the
 * amount (entered in major units), a reason, and whether to restock the items, then
 * calls the refund server action. The amount is pre-filled with the full remaining
 * balance (the common case — a full refund) and capped at it client-side; the API
 * re-validates and is the real guard (`422 EXCEEDS_PAID_AMOUNT`).
 */
export function RefundForm({
  orderId,
  currency,
  refundableMinor,
}: {
  orderId: string;
  currency: string;
  /** The remaining refundable balance in minor units (payment amount − refunded). */
  refundableMinor: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [amount, setAmount] = useState((refundableMinor / MINOR_PER_MAJOR).toFixed(2));
  const [reason, setReason] = useState('');
  const [restockItems, setRestockItems] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onSubmit(event: React.FormEvent): void {
    event.preventDefault();
    setError(null);

    const amountMinor = Math.round(Number(amount) * MINOR_PER_MAJOR);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setError('Enter a refund amount greater than zero.');
      return;
    }
    if (amountMinor > refundableMinor) {
      setError(`The most you can refund is ${formatMoney(refundableMinor, currency)}.`);
      return;
    }
    if (reason.trim().length === 0) {
      setError('Enter a reason for the refund.');
      return;
    }

    startTransition(async () => {
      const result = await refundOrderAction(orderId, {
        amount: amountMinor,
        reason: reason.trim(),
        restockItems,
      });
      if (result.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
      <div {...stylex.props(styles.fieldCol)}>
        <label htmlFor="refund-amount" {...stylex.props(styles.label)}>
          Amount ({currency})
        </label>
        <input
          id="refund-amount"
          type="number"
          step="0.01"
          min="0"
          max={(refundableMinor / MINOR_PER_MAJOR).toFixed(2)}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          {...stylex.props(styles.input, styles.amountInput)}
        />
      </div>

      <div {...stylex.props(styles.fieldCol)}>
        <label htmlFor="refund-reason" {...stylex.props(styles.label)}>
          Reason
        </label>
        <textarea
          id="refund-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={500}
          placeholder="e.g. Customer returned the item"
          {...stylex.props(styles.input, styles.textarea)}
        />
      </div>

      <label {...stylex.props(styles.checkboxRow)}>
        <input
          type="checkbox"
          checked={restockItems}
          onChange={(event) => setRestockItems(event.target.checked)}
          {...stylex.props(styles.checkbox)}
        />
        Restock items (uncheck if the goods came back damaged)
      </label>

      {error && <p {...stylex.props(styles.errorMsg)}>{error}</p>}
      {done && <p {...stylex.props(styles.successMsg)}>Refund issued.</p>}

      <div>
        <Btn type="submit" v="primary" size="md" disabled={isPending}>
          {isPending ? 'Issuing…' : 'Issue refund'}
        </Btn>
      </div>
    </form>
  );
}
