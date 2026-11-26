import { describe, expect, it } from 'vitest';
import type { AdminPtSession, AdminScheduleInstance, TrainerClientRow } from '@fit/types';
import { buildTrainerHome, sortClients } from './trainer-home-model';

function cls(
  id: string,
  startsAt: string,
  endsAt: string,
  extra: Partial<AdminScheduleInstance> = {},
): AdminScheduleInstance {
  return {
    id,
    templateId: null,
    classTypeId: null,
    title: `Class ${id}`,
    category: '',
    description: '',
    pricingRule: 'INCLUDED',
    priceMinor: null,
    color: '#336699',
    imageUrl: null,
    startsAt,
    endsAt,
    durationMinutes: (Date.parse(endsAt) - Date.parse(startsAt)) / 60_000,
    trainerName: 'Coach',
    locationName: 'Main',
    room: 'Studio A',
    capacity: 10,
    bookedCount: 4,
    status: 'SCHEDULED',
    ...extra,
  };
}

function pt(id: string, startsAt: string, endsAt: string): AdminPtSession {
  return {
    id,
    trainerId: 't1',
    trainerName: 'Coach',
    classTypeId: null,
    classTypeName: null,
    classTypeColor: null,
    locationId: null,
    locationName: null,
    startsAt,
    endsAt,
    durationMinutes: (Date.parse(endsAt) - Date.parse(startsAt)) / 60_000,
    status: 'SCHEDULED',
    notes: '',
  };
}

describe('buildTrainerHome', () => {
  const now = new Date('2026-11-21T10:30:00.000Z');
  const todayEnd = '2026-11-21T20:00:00.000Z';

  it('merges classes and PT by start, splits today from later, and marks phases', () => {
    const model = buildTrainerHome({
      classes: [
        cls('late', '2026-11-21T15:00:00.000Z', '2026-11-21T16:00:00.000Z'),
        cls('done', '2026-11-21T08:00:00.000Z', '2026-11-21T09:00:00.000Z'),
        cls('tomorrow', '2026-11-22T08:00:00.000Z', '2026-11-22T09:00:00.000Z'),
      ],
      ptSessions: [
        pt('now', '2026-11-21T10:00:00.000Z', '2026-11-21T11:00:00.000Z'),
        pt('next', '2026-11-21T12:00:00.000Z', '2026-11-21T12:30:00.000Z'),
      ],
      todayEnd,
      now,
    });

    expect(model.today.map((i) => [i.id, i.phase])).toEqual([
      ['done', 'done'],
      ['now', 'now'],
      ['next', 'next'],
      ['late', 'later'],
    ]);
    expect(model.upcoming.map((i) => i.id)).toEqual(['tomorrow']);
    expect(model.today[0]?.place).toBe('Main · Studio A');
    expect(model.metrics).toEqual({
      todayClasses: 2,
      todayBooked: 8,
      todayCapacity: 20,
      todayPt: 2,
      weekSessions: 5,
      weekMinutes: 60 * 4 + 30,
    });
  });

  it('drops canceled blocks from the agenda and the counts', () => {
    const model = buildTrainerHome({
      classes: [
        cls('gone', '2026-11-21T15:00:00.000Z', '2026-11-21T16:00:00.000Z', {
          status: 'CANCELED',
        }),
      ],
      ptSessions: [],
      todayEnd,
      now,
    });
    expect(model.today).toEqual([]);
    expect(model.metrics.weekSessions).toBe(0);
  });
});

describe('sortClients', () => {
  const row = (memberId: string, next: string | null, last: string | null): TrainerClientRow => ({
    memberId,
    name: memberId,
    sessionCount: 1,
    completedCount: 0,
    upcomingCount: next ? 1 : 0,
    lastSessionAt: last,
    nextSessionAt: next,
  });

  it('puts the soonest booked client first, then the most recently seen', () => {
    const sorted = sortClients([
      row('old', null, '2026-10-01T00:00:00.000Z'),
      row('later', '2026-11-25T00:00:00.000Z', null),
      row('recent', null, '2026-11-20T00:00:00.000Z'),
      row('soon', '2026-11-22T00:00:00.000Z', null),
    ]);
    expect(sorted.map((c) => c.memberId)).toEqual(['soon', 'later', 'recent', 'old']);
  });
});
