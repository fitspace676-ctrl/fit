// @fit/types — trainer availability contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the staff console's trainer availability
// management (T5.11): the trainer's weekly recurring schedule the
// `GET /admin/trainers/:id/availability` read returns and the
// `PUT /admin/trainers/:id/availability` write sets. The API validates the
// inbound body with these Zod schemas and the `@fit/admin` console reuses the
// inferred types, so the availability editor and the controller can never drift.
//
// Distinct from a location's opening `hours` (`locations-admin.ts`): a location
// has a single open/close per day, whereas a trainer's day is a list of
// non-overlapping time *windows* (split shifts — e.g. a morning block and an
// evening block). Persisted as the JSON `availability` column on the `Trainer`
// model; this is the editable source the class-scheduling flows consult to know
// when a trainer can be booked.

import { z } from 'zod';

// The lowercase weekday keys (`mon`…`sun`) the weekly map below is keyed by are
// the same vocabulary as a location's opening hours; reuse `WEEKDAYS` /
// `WEEKDAY_LABELS` / `Weekday` from `@fit/types` (exported by `locations-admin`)
// when an availability editor needs to iterate the days.

/** `HH:MM` 24-hour time, e.g. `06:00` or `23:30`. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The most time windows a trainer can declare for a single day. */
export const MAX_WINDOWS_PER_DAY = 6;

/**
 * One availability window — a contiguous block the trainer can be booked within.
 * `start`/`end` are `HH:MM` 24-hour times with `end` required to fall after
 * `start`. Both default so a bare `{}` parses to a 09:00–17:00 block.
 */
export const availabilityWindowSchema = z
  .object({
    start: z.string().regex(TIME_PATTERN, 'Time must be HH:MM').default('09:00'),
    end: z.string().regex(TIME_PATTERN, 'Time must be HH:MM').default('17:00'),
  })
  .refine((window) => window.end > window.start, {
    message: 'End time must be after start time',
    path: ['end'],
  });

/** One availability window — {@link availabilityWindowSchema}. */
export type AvailabilityWindow = z.infer<typeof availabilityWindowSchema>;

/**
 * One day's availability. `available` flags whether the trainer works at all that
 * day; `windows` is the list of bookable blocks. The schema enforces that an
 * available day has at least one window and that windows never overlap, then
 * normalises the result: an unavailable day's windows are cleared to `[]` and an
 * available day's windows are sorted ascending by `start`, so the stored shape is
 * always canonical regardless of the order the editor submitted.
 */
export const dayAvailabilitySchema = z
  .object({
    available: z.boolean().default(false),
    windows: z
      .array(availabilityWindowSchema)
      .max(MAX_WINDOWS_PER_DAY, `A day can have at most ${MAX_WINDOWS_PER_DAY} time windows`)
      .default([]),
  })
  .superRefine((day, ctx) => {
    if (day.available && day.windows.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An available day needs at least one time window',
        path: ['windows'],
      });
    }
    const sorted = [...day.windows].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const current = sorted[i];
      if (prev && current && current.start < prev.end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Time windows must not overlap',
          path: ['windows'],
        });
        break;
      }
    }
  })
  .transform((day) => ({
    available: day.available,
    windows: day.available ? [...day.windows].sort((a, b) => a.start.localeCompare(b.start)) : [],
  }));

/** One day's parsed availability — {@link dayAvailabilitySchema}. */
export type DayAvailability = z.infer<typeof dayAvailabilitySchema>;

/**
 * A trainer's full weekly availability — one {@link dayAvailabilitySchema} per
 * weekday. Each day defaults, so an absent day (or a bare `{}` whole-week value,
 * the stored default for a brand-new trainer) fills to a fully-unavailable day;
 * the API always stores and returns a complete seven-day map so the editor never
 * has to guess at a missing weekday.
 */
export const weeklyAvailabilitySchema = z.object({
  mon: dayAvailabilitySchema.default({}),
  tue: dayAvailabilitySchema.default({}),
  wed: dayAvailabilitySchema.default({}),
  thu: dayAvailabilitySchema.default({}),
  fri: dayAvailabilitySchema.default({}),
  sat: dayAvailabilitySchema.default({}),
  sun: dayAvailabilitySchema.default({}),
});

/** A trainer's parsed weekly availability — {@link weeklyAvailabilitySchema}. */
export type WeeklyAvailability = z.infer<typeof weeklyAvailabilitySchema>;

/**
 * Body for `PUT /admin/trainers/:id/availability` — replace the trainer's weekly
 * availability (T5.11). The whole week is sent and stored as one document (a PUT,
 * not a per-day PATCH), so the editor and the controller agree on a single
 * canonical shape. A bare `{}` resets the trainer to fully unavailable.
 */
export const setTrainerAvailabilitySchema = z.object({
  availability: weeklyAvailabilitySchema.default({}),
});

/** Validated `PUT /admin/trainers/:id/availability` body — {@link setTrainerAvailabilitySchema}. */
export type SetTrainerAvailabilityInput = z.input<typeof setTrainerAvailabilitySchema>;

/** Parsed `PUT /admin/trainers/:id/availability` body (after defaults/transforms). */
export type SetTrainerAvailabilityData = z.infer<typeof setTrainerAvailabilitySchema>;

/**
 * Successful `GET`/`PUT /admin/trainers/:id/availability` response — the trainer's
 * complete weekly availability. Both verbs return the same shape so the editor can
 * reuse the parsed week from a save without a follow-up read.
 */
export interface TrainerAvailabilityResponse {
  availability: WeeklyAvailability;
}

/** Successful `GET /admin/trainers/:id/availability` response. */
export type GetTrainerAvailabilityResponse = TrainerAvailabilityResponse;

/** Successful `PUT /admin/trainers/:id/availability` response. */
export type SetTrainerAvailabilityResponse = TrainerAvailabilityResponse;
