import type { Metadata } from 'next';
import { Card } from '@fit/ui-kit';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  fetchAdminServiceSessions,
  fetchAdminServices,
  fetchPtSessions,
  fetchTrainers,
} from '@/lib/api';
import { getActiveLocationId } from '@/lib/active-location-server';
import { gymCalendarContext } from '@/lib/gym-time';
import { Icon } from '@/components/ui';
import { ClassesTabs } from '@/components/classes-tabs';
import { resolveWeekStart, toIsoDate, weekWindow, zonedToday } from '../schedule/week';
import { TrainerSelect, type TrainerOption } from './trainer-select';
import { PtCalendarBoard } from './pt-calendar-board';
import type { ServiceOption } from './add-slot-drawer';

export const metadata: Metadata = {
  title: 'Classes · PT Calendar - FormaCore Admin',
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

  const trainers: TrainerOption[] = await fetchTrainers({ status: 'ACTIVE', limit: TRAINER_LIMIT })
    .then((res) => res.data.map((trainer) => ({ id: trainer.id, name: trainer.name })))
    .catch(() => [] as TrainerOption[]);

  let body;
  try {
    const [sessionsRes, slotsRes, servicesRes] = await Promise.all([
      // No trainer filter unless one was picked — the calendar opens on everyone.
      fetchPtSessions({ from, to, ...(trainerId ? { trainerId } : {}), locationId }),
      // Service slots are keyed by staff member, not trainer profile, so the
      // trainer filter does not apply to them; the week and the branch do.
      fetchAdminServiceSessions({ from, to, locationId }).catch(() => ({ sessions: [] })),
      // The "Open a slot" picker offers what this branch can actually sell — a
      // service is bookable wherever its staff member is rostered.
      fetchAdminServices({ status: 'ACTIVE', limit: 100, locationId }).catch(() => null),
    ]);
    // `fetchAdminServiceSessions` builds its query string by hand and does not yet
    // forward `locationId`, so the branch is applied here as well as sent. Removing
    // this line is safe the moment that fetcher forwards the param — and unsafe
    // before then, because it is the only thing keeping the two block types on the
    // grid drawn from the same population.
    const slots = locationId
      ? slotsRes.sessions.filter((slot) => slot.locationId === locationId)
      : slotsRes.sessions;
    const services: ServiceOption[] = (servicesRes?.data ?? []).map((service) => ({
      id: service.id,
      name: service.name,
      staffName: service.staff.name,
      durationMinutes: service.durationMinutes,
    }));
    body = (
      <PtCalendarBoard
        timeZone={timeZone}
        openHour={openHour}
        closeHour={closeHour}
        weekStart={toIsoDate(weekStart)}
        sessions={sessionsRes.sessions}
        slots={slots}
        services={services}
        canWrite={canWrite}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load PT sessions (${error.status}): ${error.message}`
        : 'Could not reach the FormaCore API. Check NEXT_PUBLIC_API_URL and that the API is running.';
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
