'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney } from '../format';
import { refundOrderAction } from './actions';

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
        <label htmlFor="refund-amount" className="text-xs font-medium text-slate-500">
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
          className="w-40 rounded-card border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
        <span className="text-xs text-slate-400">
          Up to {formatMoney(refundableMinor, currency)} remaining
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="refund-reason" className="text-xs font-medium text-slate-500">
          Reason
        </label>
        <textarea
          id="refund-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={500}
          placeholder="e.g. Customer returned the item"
          className="w-full rounded-card border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={restockItems}
          onChange={(event) => setRestockItems(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
        />
        Restock items (uncheck if the goods came back damaged)
      </label>

      {error && (
        <p className="rounded-card border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {done && (
        <p className="rounded-card border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Refund issued.
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? 'Issuing…' : 'Issue refund'}
        </button>
      </div>
    </form>
  );
}
