'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Btn } from '@/components/ui';
import { formatMoney } from '../format';
import { refundOrderAction } from './actions';

/** Shared design-skin field styling (soft fill + inset ring) for the refund inputs. */
const FIELD_CLASS =
  'rounded-field bg-ink-50 px-3.5 py-2.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-white/[0.04] dark:text-white dark:ring-white/10 dark:placeholder:text-ink-500';

/** Minor units per major unit (USD/EUR/GEL — all two-decimal). */
const MINOR_PER_MAJOR = 100;

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
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="refund-amount"
          className="text-xs font-medium text-ink-500 dark:text-ink-400"
        >
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
          className={`w-40 font-mono tabular-nums ${FIELD_CLASS}`}
        />
        <span className="text-xs text-ink-400">
          Up to {formatMoney(refundableMinor, currency)} remaining
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="refund-reason"
          className="text-xs font-medium text-ink-500 dark:text-ink-400"
        >
          Reason
        </label>
        <textarea
          id="refund-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={500}
          placeholder="e.g. Customer returned the item"
          className={`w-full ${FIELD_CLASS}`}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
        <input
          type="checkbox"
          checked={restockItems}
          onChange={(event) => setRestockItems(event.target.checked)}
          className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-400 dark:border-white/20 dark:bg-white/10"
        />
        Restock items (uncheck if the goods came back damaged)
      </label>

      {error && (
        <p className="rounded-card border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-700 dark:text-danger-300">
          {error}
        </p>
      )}
      {done && (
        <p className="rounded-card border border-success-500/30 bg-success-500/10 px-3 py-2 text-sm text-success-700 dark:text-success-300">
          Refund issued.
        </p>
      )}

      <div>
        <Btn type="submit" v="primary" size="md" disabled={isPending}>
          {isPending ? 'Issuing…' : 'Issue refund'}
        </Btn>
      </div>
    </form>
  );
}
