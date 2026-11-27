'use client';

// What a trend chart shows when the selection holds one bucket ("this month" by
// month, "today" by day). One column, or one point, compares nothing: it would
// fill the card with a shape that carries no information. So the figure is said
// as a figure, read against the only scale it has: a rate against 0–100%, a
// figure made of parts against its own parts. A short line says how to get a
// trend instead.

import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui';

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

const styles = stylex.create({
  box: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    paddingBlock: '1.25rem',
    paddingInline: '1.25rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-background-muted)',
  },
  label: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  value: {
    display: 'block',
    marginTop: '0.25rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '2.5rem',
    lineHeight: 1.05,
    fontWeight: 800,
    letterSpacing: '-0.025em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  // A rate's only scale: where it sits between 0 and 100%.
  meter: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  track: {
    position: 'relative',
    height: '0.625rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--chart-guide)',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    insetBlock: 0,
    insetInlineStart: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--chart-series-1)',
    transitionProperty: 'width',
    transitionDuration: { default: '600ms', '@media (prefers-reduced-motion: reduce)': '0s' },
    transitionTimingFunction: EASE_OUT,
  },
  scale: {
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
  // A figure made of parts: one bar, split in proportion.
  split: {
    display: 'flex',
    gap: '2px',
    height: '0.625rem',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: '1.25rem',
    rowGap: '0.375rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
  },
  legendValue: {
    fontFamily: 'var(--font-family-code)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  swatch: {
    width: '0.625rem',
    height: '0.625rem',
    borderRadius: '3px',
  },
  up: { backgroundColor: 'var(--chart-series-1)' },
  stack: { backgroundColor: 'var(--chart-series-2)' },
  down: { backgroundColor: 'var(--color-error)' },
  hint: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    margin: 0,
    fontSize: '0.75rem',
    lineHeight: 1.45,
    color: 'var(--color-text-secondary)',
  },
  hintIcon: {
    flexShrink: 0,
    width: '0.875rem',
    height: '0.875rem',
    marginTop: '0.0625rem',
  },
});

export interface SingleBucketPart {
  name: string;
  /** The raw figure, for the proportion. */
  amount: number;
  /** The figure as the reader sees it. */
  display: ReactNode;
  swatch: 'up' | 'stack' | 'down';
}

export function SingleBucket({
  value,
  percent,
  parts,
}: {
  value: ReactNode;
  /** For a rate: where it sits on 0–100, drawn as a meter. */
  percent?: number;
  /** For a figure made of several series: drawn as one split bar. */
  parts?: SingleBucketPart[];
}) {
  const t = useTranslations('admin.dashboard');
  const partsTotal = parts?.reduce((sum, part) => sum + Math.max(0, part.amount), 0) ?? 0;

  return (
    <div {...stylex.props(styles.box)}>
      <div>
        <span {...stylex.props(styles.label)}>{t('singleBucket.label')}</span>
        <span {...stylex.props(styles.value)}>{value}</span>
      </div>

      {percent !== undefined ? (
        <div {...stylex.props(styles.meter)} aria-hidden>
          <span {...stylex.props(styles.track)}>
            <span
              {...stylex.props(styles.fill)}
              data-grow="x"
              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
          </span>
          <span {...stylex.props(styles.scale)}>
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </span>
        </div>
      ) : null}

      {parts && parts.length > 0 ? (
        <>
          {partsTotal > 0 ? (
            <div aria-hidden {...stylex.props(styles.split)}>
              {parts
                .filter((part) => part.amount > 0)
                .map((part) => (
                  <span
                    key={part.name}
                    {...stylex.props(styles[part.swatch])}
                    data-grow="x"
                    style={{ width: `${(part.amount / partsTotal) * 100}%` }}
                  />
                ))}
            </div>
          ) : null}
          <div {...stylex.props(styles.legend)}>
            {parts.map((part) => (
              <span key={part.name} {...stylex.props(styles.legendItem)}>
                <span aria-hidden {...stylex.props(styles.swatch, styles[part.swatch])} />
                {part.name} <span {...stylex.props(styles.legendValue)}>{part.display}</span>
              </span>
            ))}
          </div>
        </>
      ) : null}

      <p {...stylex.props(styles.hint)}>
        <Icon name="info" {...stylex.props(styles.hintIcon)} />
        {t('singleBucket.hint')}
      </p>
    </div>
  );
}
