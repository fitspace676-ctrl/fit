'use client';

import { useMemo, useState } from 'react';
import { computeCashVariance } from '@fit/types';
import { formatPrice, inputToMinor } from '@/app/(dashboard)/products/format-price';
import { Badge, Card, Field, Input, type Tone } from '@/components/ui';

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

  const status = variance?.status ?? null;
  const tone: Tone = status === 'balanced' ? 'success' : status === 'over' ? 'warning' : 'danger';
  const label = status === 'balanced' ? 'Balanced' : status === 'over' ? 'Over' : 'Short';

  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
        Balance the drawer
      </h2>

      <dl className="flex items-center justify-between text-sm">
        <dt className="text-ink-500 dark:text-ink-400">Expected cash</dt>
        <dd className="font-mono font-semibold tabular-nums text-ink-900 dark:text-white">
          {formatPrice(expectedCash, currency)}
        </dd>
      </dl>

      <Field label="Counted cash" htmlFor="counted-cash">
        <Input
          id="counted-cash"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
          placeholder="0.00"
          className="text-right font-mono tabular-nums"
        />
      </Field>

      {variance !== null ? (
        <div className="flex items-center justify-between border-t border-ink-100 pt-4 dark:border-white/10">
          <Badge tone={tone} icon={status === 'balanced' ? 'check' : undefined}>
            {label}
          </Badge>
          <span className="font-mono text-lg font-bold tabular-nums text-ink-900 dark:text-white">
            {variance.variance > 0 ? '+' : ''}
            {formatPrice(variance.variance, currency)}
          </span>
        </div>
      ) : null}
    </Card>
  );
}
