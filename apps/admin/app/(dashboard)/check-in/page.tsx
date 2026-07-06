import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchCheckInStats, fetchTodayCheckIns } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Icon } from '@/components/ui';
import { ReceptionBoard } from './reception-board';

export const metadata: Metadata = {
  title: 'Check-in — Fit Admin',
  description:
    'The reception desk: scan or look up a member, check them in, and watch the live arrivals feed.',
};

// Reception reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

const ping = stylex.keyframes({
  '75%': { transform: 'scale(2)', opacity: 0 },
  '100%': { transform: 'scale(2)', opacity: 0 },
});

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  liveChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-success-muted)',
    paddingInline: '0.625rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-success)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-success) 30%, transparent)',
  },
  pulseWrap: {
    position: 'relative',
    display: 'flex',
    height: '0.5rem',
    width: '0.5rem',
  },
  pingDot: {
    position: 'absolute',
    display: 'inline-flex',
    height: '100%',
    width: '100%',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-success)',
    opacity: 0.75,
    animationName: ping,
    animationDuration: '1s',
    animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
    animationIterationCount: 'infinite',
  },
  solidDot: {
    position: 'relative',
    display: 'inline-flex',
    height: '0.5rem',
    width: '0.5rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-success)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '28rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
});

/**
 * The reception (check-in) screen (T4.12). Server-fetches the live KPI snapshot and
 * today's arrivals feed, then hands them to the client board (QR viewport, manual
 * lookup + eligibility card, live arrivals list). The whole `/check-in` route is
 * already gated by the middleware + the API guards for `MemberRead` staff; a member
 * with the write capability can also record arrivals. A failed fetch degrades to an
 * inline alert (mirroring the dashboard) rather than crashing the page.
 */
export default async function CheckInPage() {
  const t = await getTranslations('admin.checkin');
  const session = await getServerSession();
  const canCheckIn = session !== null && roleHasPermission(session.role, Permission.MemberWrite);

  let board;
  try {
    const [stats, todayCheckIns] = await Promise.all([fetchCheckInStats(), fetchTodayCheckIns()]);
    board = (
      <ReceptionBoard
        initialStats={stats}
        initialArrivals={todayCheckIns.checkIns}
        canCheckIn={canCheckIn}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? t('error.withStatus', { status: error.status, message: error.message })
        : t('error.unreachable');
    board = (
      <Card variant="default" padding={0} xstyle={styles.errorCard}>
        <Icon name="info" {...stylex.props(styles.errorIcon)} />
        <p role="alert" {...stylex.props(styles.errorText)}>
          {message}
        </p>
      </Card>
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headLeft)}>
          <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
          <span {...stylex.props(styles.liveChip)}>
            <span {...stylex.props(styles.pulseWrap)}>
              <span {...stylex.props(styles.pingDot)} />
              <span {...stylex.props(styles.solidDot)} />
            </span>
            {t('live')}
          </span>
        </div>
        <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
      </header>

      {board}
    </div>
  );
}
