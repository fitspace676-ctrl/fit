// T5.3 — class-instance generator unit tests.
//
// Exercises the pure rrule expansion (`occurrencesInWindow`) and the full
// generation pass (`generateClassInstances`) against a lightweight in-memory
// Prisma double. Everything is anchored in UTC, matching how `validFrom` is
// stored and how the job materialises occurrences.

import { describe, expect, it, vi } from 'vitest';
import { ClassTemplateStatus, InstanceStatus } from '../generated/client';
import {
  DEFAULT_WEEKS_AHEAD,
  generateClassInstances,
  occurrencesInWindow,
  type GeneratorPrisma,
} from './generate-instances';

/** A UTC instant from calendar parts, keeping the tests readable. */
function utc(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

/** Shape of a template row as the generator selects it. */
interface TemplateRow {
  id: string;
  gymId: string;
  rrule: string;
  durationMinutes: number;
  validFrom: Date;
  validUntil: Date | null;
}

type CreatedRow = {
  gymId: string;
  templateId: string;
  startsAt: Date;
  endsAt: Date;
  status: InstanceStatus;
};

/**
 * Build a Prisma double over a fixed set of templates and (optionally) the
 * already-persisted instance start instants. Captures every created row and
 * records the `findMany` filter so tests can assert the ACTIVE-only scope.
 */
function makePrisma(templates: TemplateRow[], existingStarts: Date[] = []) {
  const created: CreatedRow[] = [];
  const templateWhere: unknown[] = [];

  const createMany = vi.fn((args: { data: CreatedRow[] }) => {
    created.push(...args.data);
    return Promise.resolve({ count: args.data.length });
  });

  const prisma = {
    classTemplate: {
      findMany: vi.fn((args: { where?: unknown }) => {
        templateWhere.push(args?.where);
        return Promise.resolve(templates);
      }),
    },
    classInstance: {
      findMany: vi.fn((args: { where: { startsAt: { gte: Date; lte: Date } } }) => {
        const { gte, lte } = args.where.startsAt;
        return Promise.resolve(
          existingStarts.filter((d) => d >= gte && d <= lte).map((startsAt) => ({ startsAt })),
        );
      }),
      createMany,
    },
  };

  return { prisma: prisma as unknown as GeneratorPrisma, created, templateWhere, createMany };
}

describe('occurrencesInWindow', () => {
  it('expands a weekly MO/WE/FR rule across the 4-week window', () => {
    const occ = occurrencesInWindow(
      'FREQ=WEEKLY;BYDAY=MO,WE,FR',
      utc(2026, 6, 8), // a Monday
      utc(2026, 6, 8),
      utc(2026, 7, 6), // 28 days later (exclusive)
      null,
    );

    // 4 weeks × 3 weekdays = 12; the boundary Monday (Jul 6) is excluded.
    expect(occ).toHaveLength(12);
    expect(occ[0]).toEqual(utc(2026, 6, 8));
    expect(occ.at(-1)).toEqual(utc(2026, 7, 3));
    // All occurrences land at 00:00 UTC (anchored on validFrom's midnight).
    expect(occ.every((d) => d.getUTCHours() === 0 && d.getUTCMinutes() === 0)).toBe(true);
  });

  it('honours an rrule COUNT bound regardless of the window width', () => {
    const occ = occurrencesInWindow(
      'FREQ=DAILY;COUNT=3',
      utc(2026, 6, 8),
      utc(2026, 6, 8),
      utc(2026, 7, 6),
      null,
    );
    expect(occ).toEqual([utc(2026, 6, 8), utc(2026, 6, 9), utc(2026, 6, 10)]);
  });

  it('clamps to an inclusive validUntil (keeping the whole final day)', () => {
    const occ = occurrencesInWindow(
      'FREQ=WEEKLY;BYDAY=MO,WE,FR',
      utc(2026, 6, 8),
      utc(2026, 6, 8),
      utc(2026, 7, 6),
      utc(2026, 6, 12), // inclusive Friday
    );
    expect(occ).toEqual([utc(2026, 6, 8), utc(2026, 6, 10), utc(2026, 6, 12)]);
  });

  it('never returns occurrences before `now`, even on the anchor day', () => {
    const occ = occurrencesInWindow(
      'FREQ=WEEKLY;BYDAY=MO,WE,FR',
      utc(2026, 6, 8),
      utc(2026, 6, 8, 6), // job runs 06:00 on the Monday → 00:00 occurrence is past
      utc(2026, 7, 6),
      null,
    );
    expect(occ[0]).toEqual(utc(2026, 6, 10));
    expect(occ).toHaveLength(11);
  });

  it('returns nothing when the template only becomes valid after the window', () => {
    const occ = occurrencesInWindow(
      'FREQ=WEEKLY;BYDAY=MO',
      utc(2027, 1, 4),
      utc(2026, 6, 8),
      utc(2026, 7, 6),
      null,
    );
    expect(occ).toEqual([]);
  });
});

describe('generateClassInstances', () => {
  const now = utc(2026, 6, 8);

  it('materialises SCHEDULED instances with derived endsAt for an active template', async () => {
    const { prisma, created } = makePrisma([
      {
        id: 't1',
        gymId: 'g1',
        rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
        durationMinutes: 60,
        validFrom: now,
        validUntil: null,
      },
    ]);

    const result = await generateClassInstances(prisma, { now });

    expect(result.templatesProcessed).toBe(1);
    expect(result.instancesCreated).toBe(12);
    expect(result.details[0]).toEqual({ templateId: 't1', gymId: 'g1', created: 12 });
    expect(created).toHaveLength(12);

    const first = created[0]!;
    expect(first.gymId).toBe('g1');
    expect(first.templateId).toBe('t1');
    expect(first.status).toBe(InstanceStatus.SCHEDULED);
    expect(first.startsAt).toEqual(utc(2026, 6, 8));
    expect(first.endsAt).toEqual(utc(2026, 6, 8, 1)); // +60 min
  });

  it('defaults to a 4-week horizon', async () => {
    const { prisma } = makePrisma([
      {
        id: 't1',
        gymId: 'g1',
        rrule: 'FREQ=DAILY',
        durationMinutes: 30,
        validFrom: now,
        validUntil: null,
      },
    ]);

    const result = await generateClassInstances(prisma, { now });

    expect(DEFAULT_WEEKS_AHEAD).toBe(4);
    expect(result.windowEnd).toBe(utc(2026, 7, 6).toISOString());
    // Daily for 28 days, [now, now+28d): 28 occurrences.
    expect(result.instancesCreated).toBe(28);
  });

  it('only queries ACTIVE templates so PAUSED ones never generate', async () => {
    const { prisma, templateWhere } = makePrisma([]);
    await generateClassInstances(prisma, { now });
    expect(templateWhere[0]).toEqual({ status: ClassTemplateStatus.ACTIVE });
  });

  it('is idempotent — skips occurrences that already have a row', async () => {
    const { prisma, created } = makePrisma(
      [
        {
          id: 't1',
          gymId: 'g1',
          rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
          durationMinutes: 45,
          validFrom: now,
          validUntil: null,
        },
      ],
      [utc(2026, 6, 8), utc(2026, 6, 10)], // first two occurrences already persisted
    );

    const result = await generateClassInstances(prisma, { now });

    expect(result.instancesCreated).toBe(10);
    expect(created).toHaveLength(10);
    expect(created.some((r) => r.startsAt.getTime() === utc(2026, 6, 8).getTime())).toBe(false);
    expect(created[0]!.startsAt).toEqual(utc(2026, 6, 12));
  });

  it('creates nothing (and skips the insert) when no occurrences fall in the window', async () => {
    const { prisma, createMany } = makePrisma([
      {
        id: 't1',
        gymId: 'g1',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        durationMinutes: 60,
        validFrom: utc(2027, 1, 4),
        validUntil: null,
      },
    ]);

    const result = await generateClassInstances(prisma, { now });

    expect(result.instancesCreated).toBe(0);
    expect(result.details[0]!.created).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('processes templates across multiple gyms in one pass', async () => {
    const { prisma } = makePrisma([
      {
        id: 't1',
        gymId: 'g1',
        rrule: 'FREQ=DAILY;COUNT=2',
        durationMinutes: 60,
        validFrom: now,
        validUntil: null,
      },
      {
        id: 't2',
        gymId: 'g2',
        rrule: 'FREQ=DAILY;COUNT=3',
        durationMinutes: 60,
        validFrom: now,
        validUntil: null,
      },
    ]);

    const result = await generateClassInstances(prisma, { now });

    expect(result.templatesProcessed).toBe(2);
    expect(result.instancesCreated).toBe(5);
    expect(result.details).toEqual([
      { templateId: 't1', gymId: 'g1', created: 2 },
      { templateId: 't2', gymId: 'g2', created: 3 },
    ]);
  });
});
