import type { Metadata } from 'next';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchCheckInStats, fetchTodayCheckIns } from '@/lib/api';
import { Badge, Card, Icon } from '@/components/ui';
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
        ? `Could not load reception data (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
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
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
              Reception
            </h1>
            <Badge tone="success">
              <span className="inline-flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success-500" />
                </span>
                Live
              </span>
            </Badge>
          </div>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Scan a member&apos;s QR or check them in by name.
          </p>
        </div>
      </header>

      {board}
    </div>
  );
}
