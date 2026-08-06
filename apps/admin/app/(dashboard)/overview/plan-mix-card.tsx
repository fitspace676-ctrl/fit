'use client';

import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type { DashboardOverviewResponse } from '@fit/types';
import { EmptyState } from './format';

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    padding: '1.25rem',
  },
  cardHeadBaseline: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: '1rem',
  },
  sectionLabel: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  metaText: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  planBar: {
    display: 'flex',
    height: '0.75rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    marginBottom: '1rem',
  },
  planSeg: {
    height: '100%',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  planRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    fontSize: '0.875rem',
  },
  planName: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: '0.5rem',
    color: 'var(--color-text-secondary)',
  },
  swatch: {
    display: 'inline-block',
    height: '0.625rem',
    width: '0.625rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
  },
  truncate: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  planCount: {
    flexShrink: 0,
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
});

/* -------------------------------------------------------------------------- */
/*  Plan mix                                                                   */
/* -------------------------------------------------------------------------- */

export function PlanMixCard({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const { total, plans } = data.planMix;

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.cardHeadBaseline)}>
        <h2 {...stylex.props(styles.sectionLabel)}>{t('planMix.title')}</h2>
        <span {...stylex.props(styles.metaText)}>{t('planMix.count', { total })}</span>
      </div>

      {plans.length === 0 || total === 0 ? (
        <EmptyState>{t('planMix.empty')}</EmptyState>
      ) : (
        <>
          <div {...stylex.props(styles.planBar)}>
            {plans.map((plan) => (
              <span
                key={plan.planId ?? plan.name}
                {...stylex.props(styles.planSeg)}
                style={{
                  width: `${(plan.count / total) * 100}%`,
                  backgroundColor: plan.color ?? 'var(--color-accent)',
                }}
              />
            ))}
          </div>
          <ul {...stylex.props(styles.list)}>
            {plans.map((plan) => (
              <li key={plan.planId ?? plan.name} {...stylex.props(styles.planRow)}>
                <span {...stylex.props(styles.planName)}>
                  <span
                    {...stylex.props(styles.swatch)}
                    style={{ backgroundColor: plan.color ?? 'var(--color-accent)' }}
                  />
                  <span {...stylex.props(styles.truncate)}>{plan.name}</span>
                </span>
                <span {...stylex.props(styles.planCount)}>{plan.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
