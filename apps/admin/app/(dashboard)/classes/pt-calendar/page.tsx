import type { Metadata } from 'next';
import { Card } from '@fit/ui-kit';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  fetchAdminServiceSessions,
  fetchAdminServices,
  fetchPtSessions,
  fetchServiceCategories,
  fetchTrainers,
} from '@/lib/api';
import { gymCalendarContext } from '@/lib/gym-time';
import { Icon } from '@/components/ui';
import { ClassesTabs } from '@/components/classes-tabs';
import type { ScheduleOption, ScheduleView } from '../schedule/calendar-board';
import {
  dayWindow,
  monthWindow,
  resolveDayAnchor,
  resolveMonthAnchor,
  resolveWeekStart,
  toIsoDate,
  weekWindow,
  zonedToday,
} from '../schedule/week';
import { PtCalendarBoard } from './pt-calendar-board';
import type { ServiceOption } from './add-slot-drawer';

export const metadata: Metadata = {
  title: 'Classes · PT Calendar - FormaCore Admin',
  description:
    "The gym's personal-training calendar: every trainer's 1:1 sessions and service slots on the same day, week, month and list views as the class schedule, filterable by trainer.",
};

// The calendar reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Enough trainers to fill the filter without paging. */
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
 * The Classes hub's PT Calendar tab: the class Schedule's own calendar, drawn
 * over personal training. It resolves the visible window from `?week=` and
 * `?view=` exactly as the Schedule page does, fetches the trainer calendar's
 * sessions and the service slots for that window, and hands them to the board.
 *
 * `?trainerId=` and `?categoryId=` are optional narrowing filters, not gates:
 * the calendar opens on every trainer and every category. A category is a
 * property of a service, so the category filter narrows the service slots;
 * the trainer calendar's own sessions carry no category and step aside while
 * one is chosen. Reads require `PtSessionRead` (the API guard), writes
 * `PtSessionManage` - the board only offers add / cancel / complete to writers.
 */
export default async function PtCalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const t = await getTranslations('admin.ptCalendar');

  const rawView = readParam(raw, 'view');
  const view: ScheduleView =
    rawView === 'month' || rawView === 'list' || rawView === 'day' ? rawView : 'week';
  const trainerId = readParam(raw, 'trainerId');
  const categoryId = readParam(raw, 'categoryId');
  const weekParam = readParam(raw, 'week') || undefined;

  // The PT calendar is the gym's own week, on the gym's clock - see `gymTimeZone`.
  const { timeZone, openHour, closeHour } = await gymCalendarContext();
  const today = zonedToday(new Date(), timeZone);
  const weekStart = resolveWeekStart(weekParam, today);
  const monthAnchor = resolveMonthAnchor(weekParam, today);
  const dayAnchor = resolveDayAnchor(weekParam, today);
  // Each view fetches exactly the window it draws: the whole month grid, one
  // gym-local day for the agenda, a single week for the week grid + list.
  const { from, to } =
    view === 'month'
      ? monthWindow(monthAnchor, timeZone)
      : view === 'day'
        ? dayWindow(dayAnchor, timeZone)
        : weekWindow(weekStart, timeZone);

  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.PtSessionManage);

  const [trainers, categories] = await Promise.all([
    fetchTrainers({ status: 'ACTIVE', limit: TRAINER_LIMIT })
      .then((res): ScheduleOption[] =>
        res.data.map((trainer) => ({ id: trainer.id, name: trainer.name })),
      )
      .catch((): ScheduleOption[] => []),
    // The category filter's options: the gym's own service categories.
    fetchServiceCategories()
      .then((res): ScheduleOption[] => res.data.map((c) => ({ id: c.id, name: c.name })))
      .catch((): ScheduleOption[] => []),
  ]);

  let body;
  try {
    const [sessionsRes, slotsRes, servicesRes] = await Promise.all([
      // No trainer filter unless one was picked - the calendar opens on everyone.
      // A category filter leaves the trainer calendar out: those sessions have
      // no service, so no category to match.
      categoryId
        ? Promise.resolve({ sessions: [] })
        : fetchPtSessions({ from, to, ...(trainerId ? { trainerId } : {}) }),
      // Service slots are keyed by staff member, not trainer profile, so the
      // trainer filter does not apply to them; the window and the category do.
      fetchAdminServiceSessions({ from, to, ...(categoryId ? { categoryId } : {}) }).catch(() => ({
        sessions: [],
      })),
      fetchAdminServices({ status: 'ACTIVE', limit: 100 }).catch(() => null),
    ]);
    const services: ServiceOption[] = (servicesRes?.data ?? []).map((service) => ({
      id: service.id,
      name: service.name,
      staffName: service.staff.name,
      category: service.category?.name ?? null,
      durationMinutes: service.durationMinutes,
    }));
    body = (
      <PtCalendarBoard
        view={view}
        weekStart={toIsoDate(weekStart)}
        monthAnchor={toIsoDate(monthAnchor)}
        dayAnchor={toIsoDate(dayAnchor)}
        sessions={sessionsRes.sessions}
        slots={slotsRes.sessions}
        services={services}
        trainers={trainers}
        trainerId={trainerId}
        categories={categories}
        categoryId={categoryId}
        canWrite={canWrite}
        timeZone={timeZone}
        openHour={openHour}
        closeHour={closeHour}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? t('error.withStatus', { status: error.status, message: error.message })
        : t('error.unreachable');
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
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
      </header>

      <ClassesTabs />

      {body}
    </div>
  );
}
