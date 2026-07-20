import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import type { AdminClassTypeOption } from '@fit/types';
import { ApiError, fetchClassTypeOptions, fetchPtSessions, fetchTrainers } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Icon } from '@/components/ui';
import { ClassesTabs } from '@/components/classes-tabs';
import { resolveWeekStart, toIsoDate, weekWindow } from '../schedule/week';
import { TrainerSelect, type TrainerOption } from './trainer-select';
import { PtCalendarBoard } from './pt-calendar-board';

export const metadata: Metadata = {
  title: 'Classes · PT Calendar — Fit Admin',
  description:
    'A trainer’s weekly personal-training calendar: pick a trainer, see their 1:1 sessions, and schedule new ones like classes.',
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
  emptyPanel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBlock: '4rem',
    paddingInline: '1rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    textAlign: 'center',
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
 * trainer and a member on its own calendar (no class type / template). The tab is
 * scoped to one trainer the staff picks (`?trainerId=`); once chosen, it renders
 * that trainer's sessions on the same weekly time-grid the class Schedule uses,
 * with an "Add PT session" drawer. Reads require `ClassRead` (route middleware),
 * writes `ClassWrite` — the board only offers add / cancel / complete to writers.
 */
export default async function PtCalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const trainerId = readParam(raw, 'trainerId');
  const weekParam = readParam(raw, 'week') || undefined;

  const now = new Date();
  const weekStart = resolveWeekStart(weekParam, now);
  const { from, to } = weekWindow(weekStart);

  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ClassWrite);

  const trainers: TrainerOption[] = await fetchTrainers({ status: 'ACTIVE', limit: TRAINER_LIMIT })
    .then((res) => res.data.map((trainer) => ({ id: trainer.id, name: trainer.name })))
    .catch(() => [] as TrainerOption[]);

  let body;
  if (!trainerId) {
    body = (
      <div {...stylex.props(styles.emptyPanel)}>
        Select a trainer to view and schedule their PT sessions.
      </div>
    );
  } else {
    try {
      const [classTypes, sessionsRes] = await Promise.all([
        fetchClassTypeOptions().catch(() => [] as AdminClassTypeOption[]),
        fetchPtSessions({ from, to, trainerId }),
      ]);
      body = (
        <PtCalendarBoard
          weekStart={toIsoDate(weekStart)}
          sessions={sessionsRes.sessions}
          classTypes={classTypes}
          trainerId={trainerId}
          canWrite={canWrite}
        />
      );
    } catch (error) {
      const message =
        error instanceof ApiError
          ? `Could not load PT sessions (${error.status}): ${error.message}`
          : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
      body = (
        <Card variant="default" padding={0} xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {message}
          </p>
        </Card>
      );
    }
  }

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>PT Calendar</h1>
        <p {...stylex.props(styles.subtitle)}>
          Pick a trainer to see their personal-training calendar. Schedule 1:1 sessions with a
          member the same way you add classes, and cancel or complete them from the session.
        </p>
      </header>

      <ClassesTabs />

      <TrainerSelect trainers={trainers} trainerId={trainerId} />

      {body}
    </div>
  );
}
