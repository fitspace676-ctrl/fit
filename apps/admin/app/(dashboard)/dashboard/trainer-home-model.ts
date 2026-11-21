import type {
  AdminPtSession,
  AdminScheduleInstance,
  AdminServiceSession,
  TrainerClientRow,
} from '@fit/types';

/**
 * One block on a home agenda — a group class, a trainer-calendar PT session, or a
 * service slot (the PT a member books). Shared by the trainer and reception homes.
 */
export interface TrainerAgendaItem {
  kind: 'class' | 'pt';
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  color: string | null;
  place: string | null;
  /** Booked seats over capacity; `null` for PT, which has no seats. */
  seats: { booked: number; capacity: number } | null;
  /** The coach of a class / PT session, or the member booked onto a slot. */
  who: string | null;
  /** A service slot nobody has booked yet. */
  open: boolean;
  /** Where the block sits relative to `now`. */
  phase: 'done' | 'now' | 'next' | 'later';
}

export interface TrainerHomeModel {
  today: TrainerAgendaItem[];
  /** Blocks after today inside the window, soonest first. */
  upcoming: TrainerAgendaItem[];
  metrics: {
    todayClasses: number;
    todayBooked: number;
    todayCapacity: number;
    todayPt: number;
    weekSessions: number;
    weekMinutes: number;
  };
}

/**
 * Fold classes, PT sessions and service slots for the window into a home view's
 * model. Cancelled blocks are dropped — they are not work. `todayEnd` is the
 * instant the gym-local day ends; everything before it is "today".
 */
export function buildTrainerHome(input: {
  classes: readonly AdminScheduleInstance[];
  ptSessions: readonly AdminPtSession[];
  slots?: readonly AdminServiceSession[];
  todayEnd: string;
  now: Date;
}): TrainerHomeModel {
  const items: Omit<TrainerAgendaItem, 'phase'>[] = [
    ...input.classes
      .filter((c) => c.status !== 'CANCELED')
      .map((c) => ({
        kind: 'class' as const,
        id: c.id,
        title: c.title,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        durationMinutes: c.durationMinutes,
        color: c.color || null,
        place: joinPlace(c.locationName, c.room),
        seats: { booked: c.bookedCount, capacity: c.capacity },
        who: c.trainerName,
        open: false,
      })),
    ...input.ptSessions
      .filter((s) => s.status !== 'CANCELED')
      .map((s) => ({
        kind: 'pt' as const,
        id: s.id,
        title: s.classTypeName ?? '',
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        durationMinutes: s.durationMinutes,
        color: s.classTypeColor,
        place: s.locationName,
        seats: null,
        who: s.trainerName,
        open: false,
      })),
    ...(input.slots ?? [])
      .filter((s) => s.status !== 'CANCELLED')
      .map((s) => ({
        kind: 'pt' as const,
        id: s.id,
        title: s.serviceName,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        durationMinutes: s.durationMinutes,
        color: null,
        place: s.locationName,
        seats: null,
        who: s.memberName,
        open: s.status === 'OPEN',
      })),
  ].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  const now = input.now.getTime();
  const todayEnd = Date.parse(input.todayEnd);
  let nextMarked = false;
  const withPhase = items.map((item): TrainerAgendaItem => {
    const start = Date.parse(item.startsAt);
    const end = Date.parse(item.endsAt);
    let phase: TrainerAgendaItem['phase'] = 'later';
    if (end <= now) {
      phase = 'done';
    } else if (start <= now) {
      phase = 'now';
    } else if (!nextMarked) {
      phase = 'next';
      nextMarked = true;
    }
    return { ...item, phase };
  });

  const today = withPhase.filter((i) => Date.parse(i.startsAt) < todayEnd);
  const upcoming = withPhase.filter((i) => Date.parse(i.startsAt) >= todayEnd);
  const todayClasses = today.filter((i) => i.kind === 'class');

  return {
    today,
    upcoming,
    metrics: {
      todayClasses: todayClasses.length,
      todayBooked: todayClasses.reduce((sum, i) => sum + (i.seats?.booked ?? 0), 0),
      todayCapacity: todayClasses.reduce((sum, i) => sum + (i.seats?.capacity ?? 0), 0),
      todayPt: today.length - todayClasses.length,
      weekSessions: withPhase.length,
      weekMinutes: withPhase.reduce((sum, i) => sum + i.durationMinutes, 0),
    },
  };
}

/** Clients with a session still ahead first (soonest first), then the rest by most recent. */
export function sortClients(clients: readonly TrainerClientRow[]): TrainerClientRow[] {
  return [...clients].sort((a, b) => {
    if (a.nextSessionAt && b.nextSessionAt) {
      return Date.parse(a.nextSessionAt) - Date.parse(b.nextSessionAt);
    }
    if (a.nextSessionAt || b.nextSessionAt) {
      return a.nextSessionAt ? -1 : 1;
    }
    return (
      Date.parse(b.lastSessionAt ?? '1970-01-01') - Date.parse(a.lastSessionAt ?? '1970-01-01')
    );
  });
}

function joinPlace(location: string | null, room: string | null): string | null {
  const parts = [location, room].filter((p): p is string => Boolean(p && p.trim()));
  return parts.length > 0 ? parts.join(' · ') : null;
}
