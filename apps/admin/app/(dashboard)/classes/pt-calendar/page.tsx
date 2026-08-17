import type { Metadata } from 'next';
import { Card } from '@fit/ui-kit';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import type { AdminClassTypeOption } from '@fit/types';
import { ApiError, fetchClassTypeOptions, fetchPtSessions, fetchTrainers } from '@/lib/api';
import { gymCalendarContext } from '@/lib/gym-time';
import { Icon } from '@/components/ui';
import { ClassesTabs } from '@/components/classes-tabs';
import { resolveWeekStart, toIsoDate, weekWindow, zonedToday } from '../schedule/week';
import { TrainerSelect, type TrainerOption } from './trainer-select';
import { PtCalendarBoard } from './pt-calendar-board';

export const metadata: Metadata = {
  title: 'Classes · PT Calendar - Fit Admin',
  description:
    'The gym’s weekly personal-training calendar: every trainer’s 1:1 sessions on one grid, filterable by trainer, with new sessions scheduled like classes.',
};

export const dynamic = 'force-dynamic';

/** Enough trainers to fill the selector without paging. */
const TRAINER_LIMIT = 100;

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  header: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
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
  errorText: { margin: 0, fontSize: '0.875rem', color: 'var(--color-error)' },
});

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/**
 * The Classes hub's PT Calendar tab. Personal training is a 1:1 session between a
 * trainer and a member on its own calendar (no class type / template).
 *
 * The calendar is always on screen: it opens showing **every** trainer's sessions for
 * the week on the same weekly time-grid the class Schedule uses. `?trainerId=` is an
 * optional narrowing filter, not a gate — staff pick the trainer when they add a
 * session, not before they can see anything. Reads require `ClassRead` (route
 * middleware), writes `ClassWrite` — the board only offers add / cancel / complete to
 * writers.
 */
export default async function PtCalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const trainerId = readParam(raw, 'trainerId');
  const weekParam = readParam(raw, 'week') || undefined;

  // The PT week is the gym's week, on the gym's clock — see `gymTimeZone`.
  const { timeZone, openHour, closeHour } = await gymCalendarContext();
  const weekStart = resolveWeekStart(weekParam, zonedToday(new Date(), timeZone));
  const { from, to } = weekWindow(weekStart, timeZone);

  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ClassWrite);

  const trainers: TrainerOption[] = await fetchTrainers({ status: 'ACTIVE', limit: TRAINER_LIMIT })
    .then((res) => res.data.map((trainer) => ({ id: trainer.id, name: trainer.name })))
    .catch(() => [] as TrainerOption[]);

  let body;
  try {
    const [classTypes, sessionsRes] = await Promise.all([
      fetchClassTypeOptions().catch(() => [] as AdminClassTypeOption[]),
      // No trainer filter unless one was picked — the calendar opens on everyone.
      fetchPtSessions({ from, to, ...(trainerId ? { trainerId } : {}) }),
    ]);
    body = (
      <PtCalendarBoard
        timeZone={timeZone}
        openHour={openHour}
        closeHour={closeHour}
        weekStart={toIsoDate(weekStart)}
        sessions={sessionsRes.sessions}
        classTypes={classTypes}
        trainers={trainers}
        trainerId={trainerId || null}
        canWrite={canWrite}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load PT sessions (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    body = (
      <Card padding="none" xstyle={styles.errorCard}>
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
        <h1 {...stylex.props(styles.title)}>PT Calendar</h1>
        <p {...stylex.props(styles.subtitle)}>
          Every trainer’s personal-training week, on one calendar. Schedule a 1:1 session the same
          way you add classes — picking the trainer as you go — and cancel or complete it from the
          session. Narrow to a single trainer with the filter.
        </p>
      </header>

      <ClassesTabs />

      <TrainerSelect trainers={trainers} trainerId={trainerId} />

      {body}
    </div>
  );
}
