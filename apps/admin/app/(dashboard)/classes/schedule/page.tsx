import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchSchedule } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Icon } from '@/components/ui';
import { ClassesTabs } from '@/components/classes-tabs';
import { ScheduleBoard, type ScheduleView } from './schedule-board';
import { loadScheduleFilters } from './options';
import { loadRelationOptions } from '../options';
import { monthWindow, resolveMonthAnchor, resolveWeekStart, toIsoDate, weekWindow } from './week';

export const metadata: Metadata = {
  title: 'Schedule - Fit Admin',
  description:
    'The gym’s weekly class calendar: day columns of class occurrences with occupancy, trainer, and branch, filtered by trainer or location and paged a week at a time.',
};

// The calendar reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headTitles: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '42rem',
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
 * board (week navigation, filtering, the day-column grid). The `/classes/schedule` route is
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

  const rawView = readParam(raw, 'view');
  const view: ScheduleView = rawView === 'month' || rawView === 'list' ? rawView : 'week';

  const weekParam = readParam(raw, 'week') || undefined;
  const now = new Date();
  const weekStart = resolveWeekStart(weekParam, now);
  const monthAnchor = resolveMonthAnchor(weekParam, now);
  // Month view fetches the whole month grid; week + list fetch a single week.
  const { from, to } = view === 'month' ? monthWindow(monthAnchor) : weekWindow(weekStart);
  const trainerId = readParam(raw, 'trainerId');
  const locationId = readParam(raw, 'locationId');

  // "Add Class" opens the class-type drawer — offered only to staff who hold the
  // write capability, and its form needs the gym's trainer/location/plan options.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ClassWrite);

  let content;
  try {
    const [{ instances }, filters, addClass] = await Promise.all([
      fetchSchedule({
        from,
        to,
        trainerId: trainerId || undefined,
        locationId: locationId || undefined,
      }),
      loadScheduleFilters(),
      canWrite ? loadRelationOptions() : Promise.resolve(null),
    ]);
    content = (
      <ScheduleBoard
        view={view}
        weekStart={toIsoDate(weekStart)}
        monthAnchor={toIsoDate(monthAnchor)}
        instances={instances}
        trainers={filters.trainers}
        locations={filters.locations}
        trainerId={trainerId}
        locationId={locationId}
        canWrite={canWrite}
        addClass={addClass}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? t('error.withStatus', { status: error.status, message: error.message })
        : t('error.unreachable');
    content = (
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
        <div {...stylex.props(styles.headTitles)}>
          <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
          <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
        </div>
      </header>

      <ClassesTabs />

      {content}
    </div>
  );
}
