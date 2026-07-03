import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchSchedule } from '@/lib/api';
import { buttonClasses, Card, Icon } from '@/components/ui';
import { ScheduleBoard } from './schedule-board';
import { loadScheduleFilters } from './options';
import { resolveWeekStart, toIsoDate, weekWindow } from './week';

export const metadata: Metadata = {
  title: 'Schedule — Fit Admin',
  description:
    'The gym’s weekly class calendar: day columns of class occurrences with occupancy, trainer, and branch, filtered by trainer or location and paged a week at a time.',
};

// The calendar reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/** Read one search param as a single string, flattening arrays and blanks. */
function readParam(raw: SearchParams, key: string): string {
  const value = raw[key];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first : '';
}

/**
 * The schedule week calendar (T3.2). Resolves the visible week from `?week=` (its
 * Monday, defaulting to the current week) and the optional `?trainerId` / `?locationId`
 * filters, server-fetches `GET /admin/schedule` for that `[from, to)` window, and
 * hands the occurrences plus the trainer/location filter options to the client
 * board (week navigation, filtering, the day-column grid). The `/schedule` route is
 * already staff-gated by the middleware and the API enforces `ClassRead`, so the
 * only failure handled here is the schedule fetch itself, which degrades to an
 * inline alert (mirroring the other console screens).
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const t = await getTranslations('admin.schedule');

  const weekStart = resolveWeekStart(readParam(raw, 'week') || undefined, new Date());
  const { from, to } = weekWindow(weekStart);
  const trainerId = readParam(raw, 'trainerId');
  const locationId = readParam(raw, 'locationId');

  // "New class" / "Manage classes" reach the class-template surfaces — offered to
  // staff who hold the write capability.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ClassWrite);

  let content;
  try {
    const [{ instances }, filters] = await Promise.all([
      fetchSchedule({
        from,
        to,
        trainerId: trainerId || undefined,
        locationId: locationId || undefined,
      }),
      loadScheduleFilters(),
    ]);
    content = (
      <ScheduleBoard
        weekStart={toIsoDate(weekStart)}
        instances={instances}
        trainers={filters.trainers}
        locations={filters.locations}
        trainerId={trainerId}
        locationId={locationId}
        canWrite={canWrite}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? t('error.withStatus', { status: error.status, message: error.message })
        : t('error.unreachable');
    content = (
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
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            {t('title')}
          </h1>
          <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/classes" className={buttonClasses('outline', 'md')}>
            <Icon name="grid" className="h-4 w-4" sw={2} />
            {t('manageClasses')}
          </Link>
          {canWrite ? (
            <Link href="/classes/new" className={buttonClasses('primary', 'md')}>
              <Icon name="plus" className="h-4 w-4" sw={2} />
              {t('newClass')}
            </Link>
          ) : null}
        </div>
      </header>

      {content}
    </div>
  );
}
