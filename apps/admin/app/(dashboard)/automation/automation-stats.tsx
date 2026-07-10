// @fit/admin — the Automation console's summary KPI cards (parity with the
// reference admin's header stats). Server-rendered from `GET /automation/stats`;
// a plain presentational strip, so it stays a server component.

import * as stylex from '@stylexjs/stylex';
import { getTranslations } from 'next-intl/server';
import type { AutomationStats } from '@fit/types';

const styles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
    gap: '0.75rem',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '1rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
  },
  value: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  label: {
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
});

export async function AutomationStatsCards({ stats }: { stats: AutomationStats }) {
  const t = await getTranslations('admin.automation.stats');
  const cards: { label: string; value: string }[] = [
    { label: t('active'), value: `${stats.activeRules} / ${stats.totalRules}` },
    { label: t('totalRuns'), value: stats.totalRuns.toLocaleString() },
    { label: t('messagesSent'), value: stats.messagesSent.toLocaleString() },
    { label: t('last30'), value: stats.sentLast30Days.toLocaleString() },
  ];
  return (
    <div {...stylex.props(styles.grid)}>
      {cards.map((card) => (
        <div key={card.label} {...stylex.props(styles.card)}>
          <span {...stylex.props(styles.value)}>{card.value}</span>
          <span {...stylex.props(styles.label)}>{card.label}</span>
        </div>
      ))}
    </div>
  );
}
