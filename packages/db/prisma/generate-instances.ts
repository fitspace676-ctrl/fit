// T5.3 — Auto-generate ClassInstances (4 weeks ahead).
//
// A ClassTemplate is the recurrence *rule*; this job materialises it into the
// concrete `ClassInstance` rows the calendar and booking flows read. It runs
// system-wide (every gym, not tenant-scoped) on a schedule — see
// `generate-instances.run.ts` and the `db:generate-instances` script — and
// extends the booking horizon to `now + weeksAhead` (default 4) on each pass.
//
// Design notes:
//   • Expansion uses rrule.js, the engine the T5.1 round-trip test
//     (`rrule.spec.ts`) pins the stored rrule strings against.
//   • The recurrence anchor (DTSTART) is `template.validFrom`. The schema has no
//     time-of-day column and `validFrom` is stored at UTC midnight, so
//     occurrences fall at 00:00 UTC on the days the rrule selects. Everything is
//     kept in UTC so rrule.js never drifts by the host timezone — matching how
//     `validFrom` and the seed store dates.
//   • Generation is idempotent: an occurrence whose `startsAt` already has a row
//     (in any status) is skipped, so re-runs add only the newly-in-window
//     occurrences and a CANCELED / detached instance is never resurrected.

import { RRule } from 'rrule';
import { ClassTemplateStatus, InstanceStatus, type PrismaClient } from '../generated/client';

/** Milliseconds in one day — the unit the 4-week horizon and `validUntil` clamp use. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Default booking horizon, in weeks, the job keeps materialised ahead of `now`. */
export const DEFAULT_WEEKS_AHEAD = 4;

/** The Prisma surface the generator touches — lets tests inject a lightweight mock. */
export type GeneratorPrisma = Pick<PrismaClient, 'classTemplate' | 'classInstance'>;

/** Knobs for {@link generateClassInstances}; both default so a bare call "just works". */
export interface GenerateClassInstancesOptions {
  /** The instant to generate from (occurrences before it are left in the past). Defaults to `new Date()`. */
  now?: Date;
  /** How many weeks ahead of `now` to materialise. Defaults to {@link DEFAULT_WEEKS_AHEAD}. */
  weeksAhead?: number;
}

/** Per-template accounting the job returns for logging / assertions. */
export interface GenerateClassInstancesTemplateResult {
  templateId: string;
  gymId: string;
  created: number;
}

/** Summary of one generation pass. */
export interface GenerateClassInstancesResult {
  /** Inclusive lower bound of the materialised window (ISO-8601). */
  windowStart: string;
  /** Exclusive upper bound of the materialised window (ISO-8601). */
  windowEnd: string;
  /** Active templates considered this pass. */
  templatesProcessed: number;
  /** Total `ClassInstance` rows inserted this pass. */
  instancesCreated: number;
  /** Per-template breakdown, in the order templates were processed. */
  details: GenerateClassInstancesTemplateResult[];
}

/**
 * Expand one template's rrule into the occurrence start instants that fall inside
 * the generation window. The window is the intersection of `[windowStart,
 * windowEnd)`, the template's `[validFrom, validUntil]` validity, and the rrule's
 * own `UNTIL` / `COUNT` bound. `validUntil` is an inclusive date, so its whole UTC
 * day is kept. Returns the instants sorted ascending (rrule.js already yields
 * them in order).
 */
export function occurrencesInWindow(
  rrule: string,
  validFrom: Date,
  windowStart: Date,
  windowEnd: Date,
  validUntil: Date | null,
): Date[] {
  // Anchor the recurrence on validFrom; the parsed rrule supplies FREQ/BYDAY/…
  const options = RRule.parseString(rrule);
  options.dtstart = validFrom;
  const rule = new RRule(options);

  // Never generate occurrences before the template is valid or before `now`.
  const genStart = windowStart > validFrom ? windowStart : validFrom;

  // Clamp the upper bound by an inclusive `validUntil` (end of that UTC day).
  let genEnd = windowEnd;
  if (validUntil) {
    const validUntilEnd = new Date(validUntil.getTime() + DAY_MS);
    if (validUntilEnd < genEnd) {
      genEnd = validUntilEnd;
    }
  }

  if (genEnd <= genStart) {
    return [];
  }

  // `between(after, before, inc=true)` includes both endpoints; re-filter to the
  // half-open `[genStart, genEnd)` interval so a horizon boundary never
  // double-materialises across consecutive runs.
  return rule
    .between(genStart, genEnd, true)
    .filter((occurrence) => occurrence >= genStart && occurrence < genEnd);
}

/**
 * Materialise `ClassInstance` rows for every ACTIVE class template across all
 * gyms, out to `now + weeksAhead`.
 *
 * The pass is system-wide and idempotent: it queries the occurrences already
 * persisted for each template in the target span and inserts only the missing
 * ones, so it is safe to run repeatedly (e.g. nightly) — each run simply extends
 * the horizon. PAUSED templates are skipped (they keep their definition but stop
 * generating), and a per-occurrence `endsAt` is derived from the template's
 * `durationMinutes`. New rows are always `SCHEDULED`; later lifecycle states are
 * applied by other flows.
 */
export async function generateClassInstances(
  prisma: GeneratorPrisma,
  options: GenerateClassInstancesOptions = {},
): Promise<GenerateClassInstancesResult> {
  const now = options.now ?? new Date();
  const weeksAhead = options.weeksAhead ?? DEFAULT_WEEKS_AHEAD;
  const windowStart = now;
  const windowEnd = new Date(now.getTime() + weeksAhead * 7 * DAY_MS);

  const templates = await prisma.classTemplate.findMany({
    where: { status: ClassTemplateStatus.ACTIVE },
    select: {
      id: true,
      gymId: true,
      rrule: true,
      durationMinutes: true,
      validFrom: true,
      validUntil: true,
    },
  });

  const details: GenerateClassInstancesTemplateResult[] = [];
  let instancesCreated = 0;

  for (const template of templates) {
    const occurrences = occurrencesInWindow(
      template.rrule,
      template.validFrom,
      windowStart,
      windowEnd,
      template.validUntil,
    );

    if (occurrences.length === 0) {
      details.push({ templateId: template.id, gymId: template.gymId, created: 0 });
      continue;
    }

    // Idempotency: skip any occurrence that already has a row (any status), so a
    // re-run only adds newly-in-window occurrences and never resurrects a
    // CANCELED / detached instance.
    const existing = await prisma.classInstance.findMany({
      where: {
        templateId: template.id,
        startsAt: { gte: occurrences[0], lte: occurrences[occurrences.length - 1] },
      },
      select: { startsAt: true },
    });
    const existingStarts = new Set(existing.map((row) => row.startsAt.getTime()));

    const rows = occurrences
      .filter((startsAt) => !existingStarts.has(startsAt.getTime()))
      .map((startsAt) => ({
        gymId: template.gymId,
        templateId: template.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + template.durationMinutes * 60 * 1000),
        status: InstanceStatus.SCHEDULED,
      }));

    if (rows.length > 0) {
      const { count } = await prisma.classInstance.createMany({ data: rows });
      instancesCreated += count;
      details.push({ templateId: template.id, gymId: template.gymId, created: count });
    } else {
      details.push({ templateId: template.id, gymId: template.gymId, created: 0 });
    }
  }

  return {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    templatesProcessed: templates.length,
    instancesCreated,
    details,
  };
}
