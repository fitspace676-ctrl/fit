'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@fit/ui-kit';
import * as stylex from '@stylexjs/stylex';
import type { DashboardAlert, DashboardOverviewResponse } from '@fit/types';
import { Icon, type IconName } from '@/components/ui';
import { EmptyState, timeAgo } from './format';

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
    fontSize: '0.8125rem',
    fontWeight: 600,
    letterSpacing: '-0.005em',
    color: 'var(--color-text-primary)',
  },
  metaText: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  alertRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
  },
  alertIcon: {
    marginTop: '0.125rem',
    display: 'grid',
    height: '2rem',
    width: '2rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
  },
  alertToneSuccess: {
    backgroundColor: 'var(--color-success-muted)',
    color: 'var(--color-success)',
  },
  alertToneWarning: {
    backgroundColor: 'var(--color-warning-muted)',
    color: 'var(--color-warning)',
  },
  alertToneError: {
    backgroundColor: 'var(--color-error-muted)',
    color: 'var(--color-error)',
  },
  smIcon: {
    width: '1rem',
    height: '1rem',
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
/*  Alerts                                                                     */
/* -------------------------------------------------------------------------- */

const ALERT_ICON: Record<DashboardAlert['kind'], IconName> = {
  payment: 'card',
  class_full: 'users',
  payment_failed: 'info',
};

const ALERT_TONE: Record<DashboardAlert['kind'], keyof typeof styles> = {
  payment: 'alertToneSuccess',
  class_full: 'alertToneWarning',
  payment_failed: 'alertToneError',
};

export function AlertsCard({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const alerts = data.alerts;
  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.cardHeadBaseline)}>
        <h2 {...stylex.props(styles.sectionLabel)}>{t('alerts.title')}</h2>
        <span {...stylex.props(styles.metaText)}>{alerts.length}</span>
      </div>
      {alerts.length === 0 ? (
        <EmptyState>{t('alerts.empty')}</EmptyState>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {alerts.map((alert, i) => (
            <li key={`${alert.kind}-${i}`} {...stylex.props(styles.alertRow)}>
              <span {...stylex.props(styles.alertIcon, styles[ALERT_TONE[alert.kind]])}>
                <Icon name={ALERT_ICON[alert.kind]} {...stylex.props(styles.smIcon)} />
              </span>
              <span {...stylex.props(styles.alertMain)}>
                <span {...stylex.props(styles.alertTitle)}>{alert.title}</span>
                <span {...stylex.props(styles.alertDetail)}>
                  {alert.detail} · {timeAgo(t, alert.at)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
