import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchCheckInStats, fetchTodayCheckIns } from '@/lib/api';
import { Card, Icon } from '@/components/ui';
import { ReceptionBoard } from './reception-board';

export const metadata: Metadata = {
  title: 'Check-in — Fit Admin',
  description:
    'The reception desk: scan or look up a member, check them in, and watch the live arrivals feed.',
};

// Reception reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

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
      <Card className="flex items-start gap-3 border-danger-200 bg-danger-50 p-4 dark:border-danger-500/20 dark:bg-danger-500/10">
        <Icon
          name="info"
          className="mt-0.5 h-5 w-5 shrink-0 text-danger-600 dark:text-danger-300"
        />
        <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
          {message}
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            {t('title')}
          </h1>
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700 ring-1 ring-inset ring-success-500/30 dark:bg-success-500/10 dark:text-success-200">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success-500" />
            </span>
            {t('live')}
          </span>
        </div>
        <p className="max-w-md text-sm text-ink-500 dark:text-ink-400">{t('subtitle')}</p>
      </header>

      {board}
    </div>
  );
}
