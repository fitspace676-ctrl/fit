'use client';

import { useMemo, useState } from 'react';
import { computeCashVariance } from '@fit/types';
import { formatPrice, inputToMinor } from '@/app/products/format-price';

/**
 * The cash-drawer balance control on the reconciliation report. The operator counts
 * the drawer and types the figure; the variance against the day's `expectedCash`
 * (the cash takings the system recorded) is computed client-side with the shared
 * {@link computeCashVariance} — no count is ever sent to the server. A positive
 * variance is money over, a negative one a shortfall, and an exact match balances.
 */
export function CashCountForm({
  expectedCash,
  currency,
}: {
  expectedCash: number;
  currency: string;
}) {
  const [counted, setCounted] = useState('');

  const countedMinor = inputToMinor(counted);
  const variance = useMemo(
    () => (countedMinor === null ? null : computeCashVariance(expectedCash, countedMinor)),
    [countedMinor, expectedCash],
  );

  const tone =
    variance === null
      ? ''
      : variance.status === 'balanced'
        ? 'text-green-600'
        : variance.status === 'over'
          ? 'text-amber-600'
          : 'text-red-600';

  return (
    <section className="flex flex-col gap-3 rounded-card border border-slate-200 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Balance the drawer</h2>

      <dl className="flex items-center justify-between text-sm">
        <dt className="text-slate-500">Expected cash</dt>
        <dd className="font-semibold tabular-nums text-slate-900">
          {formatPrice(expectedCash, currency)}
        </dd>
      </dl>

      <label className="flex items-center justify-between gap-2 text-sm font-medium text-slate-700">
        <span>Counted cash</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
          placeholder="0.00"
          aria-label="Counted cash"
          className="w-36 rounded-card border border-slate-200 px-2 py-1 text-right text-base text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </label>

      {variance !== null ? (
        <dl className="flex items-center justify-between border-t border-slate-100 pt-3 text-base">
          <dt className="font-medium text-slate-600">
            {variance.status === 'balanced'
              ? 'Balanced'
              : variance.status === 'over'
                ? 'Over'
                : 'Short'}
          </dt>
          <dd className={`font-bold tabular-nums ${tone}`}>
            {variance.variance > 0 ? '+' : ''}
            {formatPrice(variance.variance, currency)}
          </dd>
        </dl>
      ) : null}
    </section>
  );
}
