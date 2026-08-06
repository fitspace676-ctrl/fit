'use client';

import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { Badge } from '@astryxdesign/core/Badge';
import type { DashboardOverviewResponse } from '@fit/types';
import { EmptyState, formatDate, initials, memberStatusVariant, timeAgo } from './format';

// The live pill's pulsing dot is shared with `InGymNow` (`overview/in-gym-now.tsx`),
// which owns its own copy of this keyframe — StyleX keyframes are file-local.
const pulse = stylex.keyframes({
  '0%': { opacity: 1 },
  '50%': { opacity: 0.35 },
  '100%': { opacity: 1 },
});

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    padding: '1.25rem',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
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
  livePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    paddingInline: '0.5rem',
    paddingBlock: '0.125rem',
    fontSize: '0.625rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-accent)',
  },
  liveDot: {
    display: 'inline-block',
    height: '0.375rem',
    width: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'currentColor',
    animationName: pulse,
    animationDuration: '1.6s',
    animationIterationCount: 'infinite',
  },
  checkInGrid: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: '0.5rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  checkInRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
  },
  avatar: {
    display: 'grid',
    height: '2.25rem',
    width: '2.25rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.75rem',
    fontWeight: 700,
  },
  alertMain: {
    minWidth: 0,
    flex: 1,
  },
  alertTitle: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  alertDetail: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

/* -------------------------------------------------------------------------- */
/*  Recent check-ins                                                          */
/* -------------------------------------------------------------------------- */

export function RecentCheckInsCard({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const rows = data.recentCheckIns;
  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.cardHead)}>
        <h2 {...stylex.props(styles.sectionLabel)}>{t('recentCheckIns.title')}</h2>
        <span {...stylex.props(styles.livePill)}>
          <span {...stylex.props(styles.liveDot)} />
          {t('inGymNow.live')}
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyState>{t('recentCheckIns.empty')}</EmptyState>
      ) : (
        <ul {...stylex.props(styles.checkInGrid)}>
          {rows.map((row, i) => (
            <li key={`${row.checkedInAt}-${i}`} {...stylex.props(styles.checkInRow)}>
              <span {...stylex.props(styles.avatar)}>{initials(row.name)}</span>
              <span {...stylex.props(styles.alertMain)}>
                <span {...stylex.props(styles.alertTitle)}>{row.name}</span>
                <span {...stylex.props(styles.alertDetail)}>
                  {row.planName ?? t('recentCheckIns.noPlan')} · {timeAgo(t, row.checkedInAt)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * The "recent members" card (gym-admin parity) — the latest joiners with their plan,
 * status badge, and membership expiry. Mirrors the recent-check-ins row layout. The
 * payload carries each member's `id` for a future row link into the member's profile
 * route; wiring that link is deferred to a later part of the migration.
 */
export function RecentMembersCard({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const locale = useLocale();
  const rows = data.recentMembers;
  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.cardHead)}>
        <h2 {...stylex.props(styles.sectionLabel)}>{t('recentMembers.title')}</h2>
      </div>
      {rows.length === 0 ? (
        <EmptyState>{t('recentMembers.empty')}</EmptyState>
      ) : (
        <ul {...stylex.props(styles.checkInGrid)}>
          {rows.map((row) => (
            <li key={row.id} {...stylex.props(styles.checkInRow)}>
              <span {...stylex.props(styles.avatar)}>{initials(row.name)}</span>
              <span {...stylex.props(styles.alertMain)}>
                <span {...stylex.props(styles.alertTitle)}>{row.name}</span>
                <span {...stylex.props(styles.alertDetail)}>
                  {row.planName ?? t('recentMembers.noPlan')}
                  {row.expiresAt
                    ? ` · ${t('recentMembers.expires', { date: formatDate(locale, row.expiresAt) })}`
                    : ''}
                </span>
              </span>
              <Badge
                variant={memberStatusVariant(row.status)}
                label={t(`recentMembers.status.${row.status.toLowerCase()}`)}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
