import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchSchedule } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Icon } from '@/components/ui';
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
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    height: '2.75rem',
    paddingInline: '1.25rem',
    borderRadius: 'var(--radius-element)',
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
  },
  btnOutline: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
  },
  btnPrimary: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  btnIcon: {
    width: '1rem',
    height: '1rem',
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
        <div {...stylex.props(styles.actions)}>
          <Link href="/classes" {...stylex.props(styles.btn, styles.btnOutline)}>
            <Icon name="grid" sw={2} {...stylex.props(styles.btnIcon)} />
            {t('manageClasses')}
          </Link>
          {canWrite ? (
            <Link href="/classes/new" {...stylex.props(styles.btn, styles.btnPrimary)}>
              <Icon name="plus" sw={2} {...stylex.props(styles.btnIcon)} />
              {t('newClass')}
            </Link>
          ) : null}
        </div>
      </header>

      {content}
    </div>
  );
}
