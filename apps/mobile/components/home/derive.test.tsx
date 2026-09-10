// Home's derivations — every figure on the screen, without a renderer.
//
// A `.test.tsx` and not a `.spec.ts`: `vitest.config.ts` includes only
// `lib|hooks/**/*.spec.ts`, so a spec under `components/` would run in NEITHER
// runner. The extension is the boundary (plan §5).
import type {
  ClassInstanceCard,
  MemberBookingHistoryEntry,
  MemberServiceSession,
} from '@fit/types';

import {
  attendedCount,
  nextServiceSession,
  totalBookings,
  upcomingBookings,
  waitlistCount,
} from './derive';

const NOW = new Date('2026-08-31T12:00:00.000Z');
const HOUR = 3_600_000;

function instance(overrides: Partial<ClassInstanceCard> = {}): ClassInstanceCard {
  return {
    id: 'ci',
    title: 'Spin',
    startsAt: new Date(NOW.getTime() + HOUR).toISOString(),
    endsAt: new Date(NOW.getTime() + 2 * HOUR).toISOString(),
    trainerName: 'Nino',
    trainerId: null,
    trainerAvatarUrl: null,
    locationName: 'Main',
    capacity: 10,
    bookedCount: 2,
    category: 'Cardio',
    color: '#E4F26A',
    imageUrl: null,
    ...overrides,
  };
}

function entry(
  overrides: Partial<MemberBookingHistoryEntry> & { bookingId: string },
): MemberBookingHistoryEntry {
  return {
    status: 'BOOKED',
    waitlistPosition: null,
    bookedAt: NOW.toISOString(),
    classInstance: {
      ...instance(),
      status: 'SCHEDULED',
    } as MemberBookingHistoryEntry['classInstance'],
    ...overrides,
  };
}

function session(overrides: Partial<MemberServiceSession> = {}): MemberServiceSession {
  return {
    id: 'ss',
    serviceId: 'sv',
    serviceName: 'PT',
    serviceType: 'PERSONAL_TRAINING',
    staffName: 'Ana',
    startsAt: new Date(NOW.getTime() + HOUR).toISOString(),
    endsAt: new Date(NOW.getTime() + 2 * HOUR).toISOString(),
    status: 'BOOKED',
    invoice: null,
    ...overrides,
  };
}

describe('upcoming bookings', () => {
  it('keeps only seats and waitlist places that have not started', () => {
    const rows = upcomingBookings(
      [
        entry({ bookingId: 'future-booked' }),
        entry({ bookingId: 'future-waitlist', status: 'WAITLIST', waitlistPosition: 1 }),
        // Past classes and abandoned seats are not "upcoming" in any reading.
        entry({ bookingId: 'attended', status: 'ATTENDED' }),
        entry({ bookingId: 'no-show', status: 'NO_SHOW' }),
        entry({ bookingId: 'canceled', status: 'CANCELED' }),
        entry({
          bookingId: 'already-started',
          classInstance: {
            ...instance({ startsAt: new Date(NOW.getTime() - HOUR).toISOString() }),
            status: 'SCHEDULED',
          } as MemberBookingHistoryEntry['classInstance'],
        }),
      ],
      NOW,
    );
    expect(rows.map((row) => row.bookingId)).toEqual(['future-booked', 'future-waitlist']);
  });

  it('sorts soonest first, regardless of the order the server sent', () => {
    const rows = upcomingBookings(
      [
        entry({
          bookingId: 'later',
          classInstance: {
            ...instance({ startsAt: new Date(NOW.getTime() + 5 * HOUR).toISOString() }),
            status: 'SCHEDULED',
          } as MemberBookingHistoryEntry['classInstance'],
        }),
        entry({ bookingId: 'sooner' }),
      ],
      NOW,
    );
    expect(rows.map((row) => row.bookingId)).toEqual(['sooner', 'later']);
  });

  it('survives an unparseable instant rather than sorting NaN', () => {
    const rows = upcomingBookings(
      [
        entry({
          bookingId: 'broken',
          classInstance: {
            ...instance({ startsAt: 'not a date' }),
            status: 'SCHEDULED',
          } as MemberBookingHistoryEntry['classInstance'],
        }),
        entry({ bookingId: 'fine' }),
      ],
      NOW,
    );
    expect(rows.map((row) => row.bookingId)).toEqual(['fine']);
  });

  it('survives an undefined payload', () => {
    expect(upcomingBookings(undefined, NOW)).toEqual([]);
  });
});

describe('the counters', () => {
  const ROWS = [
    entry({ bookingId: 'a', status: 'ATTENDED' }),
    entry({ bookingId: 'b', status: 'ATTENDED' }),
    entry({ bookingId: 'c', status: 'WAITLIST', waitlistPosition: 3 }),
    entry({ bookingId: 'd' }),
    entry({ bookingId: 'e', status: 'CANCELED' }),
  ];

  it('counts ATTENDED rows — the one attendance fact a member can read', () => {
    // Not a check-in count: there is no member-readable check-in log at all
    // (`admin/check-ins` is `MemberRead`/`MemberWrite`). This is a class the
    // gym marked the member present at.
    expect(attendedCount(ROWS)).toBe(2);
  });

  it('counts every booking ever made, in any state', () => {
    expect(totalBookings(ROWS)).toBe(5);
  });

  it('counts waitlist places', () => {
    expect(waitlistCount(ROWS)).toBe(1);
  });
});

describe('the next PT session', () => {
  it('is the soonest BOOKED one', () => {
    const next = nextServiceSession(
      [
        session({ id: 'later', startsAt: new Date(NOW.getTime() + 5 * HOUR).toISOString() }),
        session({ id: 'sooner' }),
        session({ id: 'cancelled', status: 'CANCELLED' }),
      ],
      NOW,
    );
    expect(next?.id).toBe('sooner');
  });

  it('ignores sessions that have already started', () => {
    expect(
      nextServiceSession(
        [session({ id: 'past', startsAt: new Date(NOW.getTime() - HOUR).toISOString() })],
        NOW,
      ),
    ).toBeNull();
  });

  it('is null for a member with none', () => {
    expect(nextServiceSession([], NOW)).toBeNull();
    expect(nextServiceSession(undefined, NOW)).toBeNull();
  });
});
