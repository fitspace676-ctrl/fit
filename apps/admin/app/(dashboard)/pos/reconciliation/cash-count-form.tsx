'use client';

import { useMemo, useState } from 'react';
import { computeCashVariance } from '@fit/types';
import { formatPrice, inputToMinor } from '@/app/(dashboard)/products/format-price';
import { Card } from '@/components/ui';

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
        ? 'text-success-700 dark:text-success-300'
        : variance.status === 'over'
          ? 'text-warning-700 dark:text-warning-300'
          : 'text-danger-600 dark:text-danger-400';

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Balance the drawer</h2>

      <dl className="flex items-center justify-between text-sm">
        <dt className="text-ink-500 dark:text-ink-400">Expected cash</dt>
        <dd className="font-mono font-semibold tabular-nums text-ink-900 dark:text-white">
          {formatPrice(expectedCash, currency)}
        </dd>
      </dl>

      <label className="flex items-center justify-between gap-2 text-sm font-medium text-ink-700 dark:text-ink-200">
        <span>Counted cash</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
          placeholder="0.00"
          aria-label="Counted cash"
          className="w-36 rounded-field border border-ink-200 bg-white px-2 py-1 text-right text-base text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
        />
      </label>

      {variance !== null ? (
        <dl className="flex items-center justify-between border-t border-ink-100 pt-3 text-base dark:border-white/10">
          <dt className="font-medium text-ink-600 dark:text-ink-300">
            {variance.status === 'balanced'
              ? 'Balanced'
              : variance.status === 'over'
                ? 'Over'
                : 'Short'}
          </dt>
          <dd className={`font-mono font-bold tabular-nums ${tone}`}>
            {variance.variance > 0 ? '+' : ''}
            {formatPrice(variance.variance, currency)}
          </dd>
        </dl>
      ) : null}
    </Card>
  );
}
