'use client';

import { useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { computeCashVariance } from '@fit/types';
import { formatPrice, inputToMinor } from '@/app/(dashboard)/products/format-price';
import { Card } from '@astryxdesign/core/Card';

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    padding: '1rem',
  },
  heading: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: 0,
    fontSize: '0.875rem',
  },
  rowLabel: {
    margin: 0,
    color: 'var(--color-text-secondary)',
  },
  rowValue: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  countLabel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  countInput: {
    width: '9rem',
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
  varianceRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: 0,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingTop: '0.75rem',
    fontSize: '1rem',
  },
  varianceLabel: {
    margin: 0,
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  varianceValue: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  toneBalanced: {
    color: 'var(--color-success)',
  },
  toneOver: {
    color: 'var(--color-warning)',
  },
  toneShort: {
    color: 'var(--color-error)',
  },
});

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
      ? null
      : variance.status === 'balanced'
        ? styles.toneBalanced
        : variance.status === 'over'
          ? styles.toneOver
          : styles.toneShort;

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <h2 {...stylex.props(styles.heading)}>Balance the drawer</h2>

      <dl {...stylex.props(styles.row)}>
        <dt {...stylex.props(styles.rowLabel)}>Expected cash</dt>
        <dd {...stylex.props(styles.rowValue)}>{formatPrice(expectedCash, currency)}</dd>
      </dl>

      <label {...stylex.props(styles.countLabel)}>
        <span>Counted cash</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
          placeholder="0.00"
          aria-label="Counted cash"
          {...stylex.props(styles.countInput)}
        />
      </label>

      {variance !== null ? (
        <dl {...stylex.props(styles.varianceRow)}>
          <dt {...stylex.props(styles.varianceLabel)}>
            {variance.status === 'balanced'
              ? 'Balanced'
              : variance.status === 'over'
                ? 'Over'
                : 'Short'}
          </dt>
          <dd {...stylex.props(styles.varianceValue, tone)}>
            {variance.variance > 0 ? '+' : ''}
            {formatPrice(variance.variance, currency)}
          </dd>
        </dl>
      ) : null}
    </Card>
  );
}
