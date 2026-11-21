import type { Metadata } from 'next';
import { Card } from '@fit/ui-kit';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Permission } from '@fit/types';
import { getConsolePermissions } from '@/lib/permissions-server';
import {
  ApiError,
  fetchAdminServiceSessions,
  fetchAdminServices,
  fetchPtSessions,
  fetchMyScheduleTrainer,
  fetchOwnServices,
  fetchServiceCategories,
  fetchTrainer,
  fetchTrainers,
} from '@/lib/api';
import { getActiveLocationId } from '@/lib/active-location-server';
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.ptCalendar.meta');
  return {
    title: t('title'),
    description: t('description'),
  };
}

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
  // `?trainerId=mine` is the coach's "My PT" toggle, resolved below.
  const requestedTrainerId = readParam(raw, 'trainerId');
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

  // Live grants (a gym may have edited the role). `PtSessionManage` writes
  // everything; `PtSessionManageOwn` only opens slots on the coach's own services.
  const permissions = await getConsolePermissions();
  const canWrite = permissions.grants.includes(Permission.PtSessionManage);
  const canManageOwn = !canWrite && permissions.grants.includes(Permission.PtSessionManageOwn);

  // Every role opens on every trainer; a coach narrows to their own with "My PT".
  const { trainerId: ownTrainerId } = await fetchMyScheduleTrainer().catch(() => ({
    trainerId: null,
  }));
  // Without the dropdown (a coach) the only narrowing is "My PT"; any other
  // `?trainerId=` reads as everyone.
  const trainerId = requestedTrainerId === 'mine' ? 'mine' : canWrite ? requestedTrainerId : '';
  const effectiveTrainerId = trainerId === 'mine' ? (ownTrainerId ?? '') : trainerId;
  // A trainer profile's staff record: what a slot (keyed by staff member, not by
  // trainer) is matched on.
  const staffIdOf = (id: string): Promise<string | null> =>
    fetchTrainer(id)
      .then((trainer) => trainer.staffId)
      .catch(() => null);
  const [filterStaffId, ownStaffId] = await Promise.all([
    effectiveTrainerId ? staffIdOf(effectiveTrainerId) : Promise.resolve(null),
    // An own-only writer manages the slots on their own staff record.
    canManageOwn && ownTrainerId ? staffIdOf(ownTrainerId) : Promise.resolve(null),
  ]);

  // THE GRID IS TWO POPULATIONS AND BOTH MUST NARROW.
  //
  // This calendar draws `PtSession` blocks and `ServiceSession` blocks on the same
  // week, and Stage 6 gave both a branch for exactly this reason. Filtering one and
  // not the other would assemble a branch-filtered calendar out of one branch's PT
  // and every branch's service slots — the defect the trainer-performance report was
  // deliberately held gym-wide to avoid, except here it would be invisible, because
  // the two block types already look different and nobody would read the mixture as
  // a mistake.
  //
  // Both narrow on their OWN `locationId` — the door the hour is booked at — not on
  // the coach's roster and not on their base branch. Someone based at the flagship
  // covering a Tuesday at the satellite delivered that hour at the satellite. A
  // session with no branch is absent from a filtered week and present in an
  // unfiltered one: nothing knows where it is, and no branch may adopt it.
  const locationId = await getActiveLocationId(raw);

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
    const [sessionsRes, slotsRes, servicesRes, ownServicesRes] = await Promise.all([
      // No trainer filter unless one was picked - the calendar opens on everyone.
      // A category filter leaves the trainer calendar out: those sessions have
      // no service, so no category to match.
      categoryId
        ? Promise.resolve({ sessions: [] })
        : trainerId === 'mine' && !effectiveTrainerId
          ? Promise.resolve({ sessions: [] })
          : fetchPtSessions({
              from,
              to,
              ...(effectiveTrainerId ? { trainerId: effectiveTrainerId } : {}),
              locationId,
            }),
      // Service slots are keyed by staff member, so a trainer filter narrows them
      // through that trainer's staff record; a trainer with none has no slots.
      (trainerId === 'mine' && !effectiveTrainerId) || (effectiveTrainerId && !filterStaffId)
        ? Promise.resolve({ sessions: [] })
        : fetchAdminServiceSessions({
            from,
            to,
            locationId,
            ...(filterStaffId ? { staffId: filterStaffId } : {}),
            ...(categoryId ? { categoryId } : {}),
          }).catch(() => ({
            sessions: [],
          })),
      // The "Open a slot" picker offers what this branch can actually sell — a
      // service is bookable wherever its staff member is rostered.
      // A coach who may only open their own slots cannot read the catalogue; the
      // API hands them just their own services instead.
      canWrite
        ? fetchAdminServices({ status: 'ACTIVE', limit: 100, locationId }).catch(() => null)
        : Promise.resolve(null),
      canManageOwn ? fetchOwnServices().catch(() => null) : Promise.resolve(null),
    ]);
    // `fetchAdminServiceSessions` builds its query string by hand and does not yet
    // forward `locationId`, so the branch is applied here as well as sent. Removing
    // this line is safe the moment that fetcher forwards the param — and unsafe
    // before then, because it is the only thing keeping the two block types on the
    // grid drawn from the same population.
    const slots = locationId
      ? slotsRes.sessions.filter((slot) => slot.locationId === locationId)
      : slotsRes.sessions;
    const services: ServiceOption[] = canManageOwn
      ? (ownServicesRes?.services ?? [])
      : (servicesRes?.data ?? []).map((service) => ({
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
        slots={slots}
        services={services}
        trainers={trainers}
        trainerId={trainerId}
        ownTrainerId={ownTrainerId}
        ownStaffId={ownStaffId}
        categories={categories}
        categoryId={categoryId}
        canWrite={canWrite}
        canAdd={canWrite || services.length > 0}
        showTrainerFilter={canWrite}
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
