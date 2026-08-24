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
//   • The recurrence anchor (DTSTART) is `template.validFrom`'s *date*; the
//     clock time is `template.startTime`, read against the gym's own zone. The
//     two were once one field — validFrom's time-of-day doubled as the start
//     time, which meant the console (whose form collects a date) created every
//     class at midnight. Expansion stays in UTC so rrule.js never drifts by the
//     host timezone, and the wall clock is applied per occurrence so a DST
//     switch moves the instant rather than the class.
//   • Generation is idempotent: an occurrence whose `startsAt` already has a row
//     (in any status) is skipped, so re-runs add only the newly-in-window
//     occurrences and a CANCELED / detached instance is never resurrected.

import { RRule } from 'rrule';
import { ClassTemplateStatus, InstanceStatus, type PrismaClient } from '../generated/client';

/** Milliseconds in one day — the unit the 4-week horizon and `validUntil` clamp use. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The offset, in milliseconds, that `timeZone` was at for a given instant —
 * positive east of UTC. Derived by formatting the instant in that zone and
 * reading the difference back, so it needs no timezone table of its own and is
 * automatically right across DST transitions.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const at = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  const asIfUtc = Date.UTC(
    at('year'),
    at('month') - 1,
    at('day'),
    at('hour'),
    at('minute'),
    at('second'),
  );
  // Drop sub-second precision on both sides so the difference is a clean offset.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The UTC instant at which a wall clock reads `hours:minutes` on the calendar day
 * `occurrence` falls on, in `timeZone`.
 *
 * A class scheduled for 09:00 means 09:00 *at the gym*, so the stored instant has
 * to be resolved per occurrence rather than once for the series — in a zone that
 * observes DST the same wall time is a different instant either side of the
 * switch. The offset depends on the instant, and the instant on the offset, so
 * the guess is refined twice: the first pass lands within an hour of the answer,
 * the second settles it even when the first guess fell on the far side of a
 * transition.
 */
export function wallClockToUtc(
  occurrence: Date,
  hours: number,
  minutes: number,
  timeZone: string,
): Date {
  const wall = Date.UTC(
    occurrence.getUTCFullYear(),
    occurrence.getUTCMonth(),
    occurrence.getUTCDate(),
    hours,
    minutes,
  );

  let utc = wall;
  for (let pass = 0; pass < 2; pass += 1) {
    utc = wall - zoneOffsetMs(new Date(utc), timeZone);
  }
  return new Date(utc);
}

/**
 * The UTC instant at which `instant`'s calendar day begins in `timeZone` —
 * local midnight of "today at the gym". Lets a caller widen a generation
 * window back to the top of the gym's day instead of the current instant, so
 * an occurrence earlier the same day still counts as part of today.
 */
export function startOfDayInZone(instant: Date, timeZone: string): Date {
  // en-CA formats as `YYYY-MM-DD`, giving the local calendar day directly.
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  return wallClockToUtc(new Date(`${day}T00:00:00.000Z`), 0, 0, timeZone);
}

/**
 * The IANA zone out of a gym's settings blob, falling back to the platform
 * default when the gym has never saved settings. Read structurally rather than
 * through `gymSettingsStoredSchema` so the generator — which runs over every gym
 * in one pass — is not taken down by one gym's malformed blob.
 */
export function gymTimeZone(settings: unknown): string {
  const locale = (settings as { locale?: { timezone?: unknown } } | null)?.locale;
  return typeof locale?.timezone === 'string' && locale.timezone !== ''
    ? locale.timezone
    : 'Asia/Tbilisi';
}

/** Split a stored `"HH:MM"` start time into its parts. */
export function parseStartTime(startTime: string): { hours: number; minutes: number } {
  const [hours, minutes] = startTime.split(':').map(Number);
  return { hours: hours ?? 0, minutes: minutes ?? 0 };
}

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
  startTime: string,
  timeZone: string,
): Date[] {
  const { hours, minutes } = parseStartTime(startTime);

  // Expand the rule over calendar days, anchored on validFrom's date. The clock
  // time comes from `startTime` afterwards, so the anchor is deliberately
  // midnight UTC: letting validFrom's own time-of-day leak in is exactly the
  // conflation this column replaced.
  const options = RRule.parseString(rrule);
  options.dtstart = new Date(
    Date.UTC(validFrom.getUTCFullYear(), validFrom.getUTCMonth(), validFrom.getUTCDate()),
  );
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

  // Expand a day wider on each side before applying the start time: an occurrence
  // whose calendar day sits just outside the window can land inside it once the
  // clock time and the zone offset are applied, and vice versa. The real bound is
  // enforced after the shift, so nothing outside `[genStart, genEnd)` survives.
  const days = rule.between(
    new Date(genStart.getTime() - DAY_MS),
    new Date(genEnd.getTime() + DAY_MS),
    true,
  );

  return days
    .map((day) => wallClockToUtc(day, hours, minutes, timeZone))
    .filter((occurrence) => occurrence >= genStart && occurrence < genEnd)
    .sort((a, b) => a.getTime() - b.getTime());
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
      startTime: true,
      validFrom: true,
      validUntil: true,
      // A start time is a wall clock, so it only resolves to an instant against
      // the gym's own zone. Selected per template rather than looked up per gym:
      // the pass is system-wide and the blob is small.
      gym: { select: { settings: true } },
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
      template.startTime,
      gymTimeZone(template.gym?.settings),
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

// ---------------------------------------------------------------------------
// T5.8 — Regenerate a template's instances after an edit.
//
// When staff edit a recurring template (its rrule, validity bounds, or
// duration), the already-materialised future occurrences must be reconciled
// against the new definition. The pass below is *pure*: it takes the new
// recurrence fields plus the template's existing future instances and returns
// the set of DB mutations the caller applies in one transaction. Keeping it
// free of Prisma makes the reconciliation rules exhaustively unit-testable and
// lets the tenant-scoped API service own the actual reads/writes.
//
// Reconciliation rules (future occurrences only — the past is immutable):
//   • A slot still on the new rule keeps its instance; if the duration changed,
//     its `endsAt` is realigned. Bookings are preserved untouched.
//   • A slot dropped from the rule with bookings is *detached* (its
//     `detachedAt` is stamped) rather than deleted, so members keep their seat
//     at the original time — a later generation pass leaves a detached row
//     alone.
//   • A slot dropped from the rule with no bookings is deleted.
//   • A new slot on the rule is created as a fresh SCHEDULED instance.
// Already-detached and non-SCHEDULED (e.g. CANCELED) occurrences are never
// touched, and never re-created at the same start — mirroring the generator's
// idempotency.

/** A future occurrence already materialised, as {@link planInstanceRegeneration} reads it. */
export interface ExistingInstance {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: InstanceStatus;
  /** Seats taken — a booked occurrence dropped from the rule is detached, not deleted. */
  bookedCount: number;
  /** Non-null once the occurrence has been edited away from its template. */
  detachedAt: Date | null;
}

/** Inputs for {@link planInstanceRegeneration}: the edited recurrence + current future rows. */
export interface PlanInstanceRegenerationInput {
  /** The template's new RFC-5545 recurrence string. */
  rrule: string;
  /** The template's recurrence anchor (DTSTART). */
  validFrom: Date;
  /** The template's inclusive validity end, or null for open-ended. */
  validUntil: Date | null;
  /** The template's new per-occurrence duration, used to derive `endsAt`. */
  durationMinutes: number;
  /** The wall-clock time each occurrence starts, `"HH:MM"` in the gym's zone. */
  startTime: string;
  /** The gym's IANA zone — the clock `startTime` is read against. */
  timeZone: string;
  /** Future instances of the template already in the horizon window. */
  existing: ExistingInstance[];
  /** The instant the edit happens (occurrences before it are left in the past). Defaults to `new Date()`. */
  now?: Date;
  /** How many weeks ahead the generator materialises. Defaults to {@link DEFAULT_WEEKS_AHEAD}. */
  weeksAhead?: number;
}

/** The reconciliation {@link planInstanceRegeneration} produces; the caller applies it. */
export interface InstanceRegenerationPlan {
  /** Occurrence starts to insert as fresh SCHEDULED instances. */
  toCreate: Date[];
  /** Surviving instances whose `endsAt` must be realigned to the new duration. */
  toRealign: { id: string; endsAt: Date }[];
  /** Booked instances dropped from the rule — detached (preserved), not deleted. */
  toDetach: string[];
  /** Unbooked, live instances dropped from the rule — deleted. */
  toDelete: string[];
}

/**
 * Reconcile a template's future instances against its edited recurrence. Pure:
 * computes the new occurrence set with {@link occurrencesInWindow} (same window
 * the generator uses, `[now, now + weeksAhead)`), diffs it against `existing`,
 * and returns the create / realign / detach / delete actions to apply. See the
 * section header for the full rule set.
 */
export function planInstanceRegeneration(
  input: PlanInstanceRegenerationInput,
): InstanceRegenerationPlan {
  const now = input.now ?? new Date();
  const weeksAhead = input.weeksAhead ?? DEFAULT_WEEKS_AHEAD;
  const windowEnd = new Date(now.getTime() + weeksAhead * 7 * DAY_MS);

  const desired = occurrencesInWindow(
    input.rrule,
    input.validFrom,
    now,
    windowEnd,
    input.validUntil,
    input.startTime,
    input.timeZone,
  );

  // Index the current future rows by their start instant for O(1) matching.
  const existingByStart = new Map<number, ExistingInstance>();
  for (const instance of input.existing) {
    existingByStart.set(instance.startsAt.getTime(), instance);
  }

  const plan: InstanceRegenerationPlan = {
    toCreate: [],
    toRealign: [],
    toDetach: [],
    toDelete: [],
  };
  const matched = new Set<number>();

  for (const startsAt of desired) {
    const key = startsAt.getTime();
    const instance = existingByStart.get(key);
    if (!instance) {
      plan.toCreate.push(startsAt);
      continue;
    }
    // A row already sits at this start — keep it (preserving any bookings) and
    // never double-materialise. Only a live, non-detached occurrence gets its
    // end realigned when the duration changed.
    matched.add(key);
    if (instance.detachedAt === null && instance.status === InstanceStatus.SCHEDULED) {
      const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60 * 1000);
      if (endsAt.getTime() !== instance.endsAt.getTime()) {
        plan.toRealign.push({ id: instance.id, endsAt });
      }
    }
  }

  for (const instance of input.existing) {
    if (matched.has(instance.startsAt.getTime())) {
      continue; // still on the rule — handled above
    }
    if (instance.detachedAt !== null || instance.status !== InstanceStatus.SCHEDULED) {
      continue; // already detached, or canceled history — leave untouched
    }
    if (instance.bookedCount > 0) {
      plan.toDetach.push(instance.id); // preserve members' seats at the old time
    } else {
      plan.toDelete.push(instance.id);
    }
  }

  return plan;
}
