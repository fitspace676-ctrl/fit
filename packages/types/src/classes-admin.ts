// @fit/types — recurring class-template admin contracts (Zod schemas + types).
//
// Shapes crossing the API boundary for the scheduling console's class-template
// management (T5.2): the paginated `GET /admin/classes` roster the admin table
// renders, the `GET /admin/classes/:id` detail view, and the create / edit /
// pause / resume writes. The API validates inbound queries/bodies with these Zod
// schemas and the `@fit/admin` console reuses the inferred types, so the table /
// form and the controller can never drift on the wire format.
//
// A class template is the *rule* a gym schedules a recurring class by, not the
// occurrences: `rrule` is an RFC-5545 RRULE string the instance-generation job
// (T5.3) expands into concrete `ClassInstance` rows between `validFrom` and an
// optional `validUntil`. The admin builds and edits that string through a visual
// recurrence editor, so this file also owns the structured {@link Recurrence}
// representation and the dependency-free {@link buildRRule} / {@link parseRRule} /
// {@link describeRecurrence} round-trip the editor and the wire share — keeping
// the rrule grammar in one place rather than hand-rolling it in the UI.

import { z } from 'zod';
import { sortDirSchema } from './members';

/**
 * A class template's lifecycle within the gym, mirroring the Prisma
 * `ClassTemplateStatus` enum. `ACTIVE` templates are the ones the
 * instance-generation job (T5.3) materialises occurrences from; `PAUSED` keeps
 * the definition but stops generating new instances (T5.2). The roster filter and
 * the status badge both key off this.
 */
export const classTemplateStatusSchema = z.enum(['ACTIVE', 'PAUSED']);

/** A class template's lifecycle state — {@link classTemplateStatusSchema}. */
export type ClassTemplateStatus = z.infer<typeof classTemplateStatusSchema>;

/**
 * How a class template is priced to members, mirroring the Prisma
 * `ClassPricingRule` enum. `FREE` is open to any active member; `INCLUDED` is
 * covered by the subscription plans in `includedPlanIds`; `PAID` charges
 * `priceMinor` per session. Personal-training templates additionally carry the
 * per-duration `pt30/45/60Minor` rates.
 */
export const classPricingRuleSchema = z.enum(['FREE', 'INCLUDED', 'PAID']);

/** How a class template is priced — {@link classPricingRuleSchema}. */
export type ClassPricingRule = z.infer<typeof classPricingRuleSchema>;

/**
 * A nullable minor-unit money field the admin form submits as a string. An empty
 * string / null / undefined normalises to `null` ("unset"); anything else is
 * coerced to a non-negative integer number of minor units (tetri/cents).
 */
const nullableMinorField = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? null : value),
  z.coerce
    .number()
    .int('Amount must be a whole number of minor units')
    .min(0, 'Amount cannot be negative')
    .max(100_000_000)
    .nullable(),
);

// ── Recurrence (the visual RRULE editor's model) ─────────────────────────────

/**
 * The recurrence frequencies the visual editor supports — a deliberate subset of
 * RFC-5545's `FREQ` covering the cadences a gym actually schedules classes on.
 * Maps 1:1 to the `FREQ=` token in the generated rrule.
 */
export const recurrenceFreqSchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY']);

/** A supported recurrence frequency — {@link recurrenceFreqSchema}. */
export type RecurrenceFreq = z.infer<typeof recurrenceFreqSchema>;

/**
 * The two-letter RFC-5545 weekday codes, in calendar order (Monday-first, the
 * `BYDAY` convention). Only meaningful for a `WEEKLY` recurrence; ignored for the
 * others.
 */
export const recurrenceWeekdaySchema = z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);

/** A weekday code — {@link recurrenceWeekdaySchema}. */
export type RecurrenceWeekday = z.infer<typeof recurrenceWeekdaySchema>;

/** Weekday codes in calendar order, the canonical ordering `BYDAY` is emitted in. */
export const RECURRENCE_WEEKDAYS: readonly RecurrenceWeekday[] = [
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
  'SU',
];

/** The most occurrences a `COUNT`-terminated recurrence may schedule (keeps generation bounded). */
export const MAX_RECURRENCE_COUNT = 730;

/**
 * How a recurrence ends. `never` is open-ended (the template's `validUntil`, if
 * any, still bounds generation); `count` stops after N occurrences (`COUNT=` in
 * the rrule); `until` stops on a date (`UNTIL=` in the rrule), an inclusive
 * `YYYY-MM-DD` the editor surfaces as a date picker.
 */
export const recurrenceEndSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('never') }),
  z.object({
    type: z.literal('count'),
    count: z.coerce.number().int().min(1).max(MAX_RECURRENCE_COUNT),
  }),
  z.object({
    type: z.literal('until'),
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Until must be a YYYY-MM-DD date'),
  }),
]);

/** How a recurrence terminates — {@link recurrenceEndSchema}. */
export type RecurrenceEnd = z.infer<typeof recurrenceEndSchema>;

/**
 * The structured recurrence the visual editor manipulates and the
 * {@link buildRRule} / {@link parseRRule} pair round-trips with the stored rrule
 * string. `interval` is the every-N spacing (`1` = every week/day/month);
 * `weekdays` only applies when `freq` is `WEEKLY` (an empty list there means "the
 * weekday of `validFrom`", matching RFC-5545's default). The `.superRefine`
 * rejects a `WEEKLY` recurrence with no weekday selected so the editor can't emit
 * an rrule that silently falls back to the start day.
 */
export const recurrenceSchema = z
  .object({
    freq: recurrenceFreqSchema,
    interval: z.coerce.number().int().min(1).max(52).default(1),
    weekdays: z.array(recurrenceWeekdaySchema).default([]),
    end: recurrenceEndSchema.default({ type: 'never' }),
  })
  .superRefine((value, ctx) => {
    if (value.freq === 'WEEKLY' && value.weekdays.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pick at least one weekday for a weekly class',
        path: ['weekdays'],
      });
    }
  });

/** The structured recurrence — {@link recurrenceSchema}. */
export type Recurrence = z.infer<typeof recurrenceSchema>;

/** Input shape for {@link recurrenceSchema} (before defaults/coercion). */
export type RecurrenceInput = z.input<typeof recurrenceSchema>;

/**
 * Serialise a {@link Recurrence} to an RFC-5545 RRULE string, e.g.
 * `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10`. Tokens are emitted in a stable
 * order so the same recurrence always yields the same string. `INTERVAL` is
 * omitted when `1` (the RFC default); `BYDAY` only for a weekly recurrence with
 * weekdays; the end clause is one of `COUNT` / `UNTIL` / nothing. `UNTIL` is the
 * inclusive date at end-of-day UTC, the form RFC-5545 expects.
 */
export function buildRRule(recurrence: Recurrence): string {
  const parts: string[] = [`FREQ=${recurrence.freq}`];

  if (recurrence.interval > 1) {
    parts.push(`INTERVAL=${recurrence.interval}`);
  }

  if (recurrence.freq === 'WEEKLY' && recurrence.weekdays.length > 0) {
    const ordered = RECURRENCE_WEEKDAYS.filter((day) => recurrence.weekdays.includes(day));
    parts.push(`BYDAY=${ordered.join(',')}`);
  }

  if (recurrence.end.type === 'count') {
    parts.push(`COUNT=${recurrence.end.count}`);
  } else if (recurrence.end.type === 'until') {
    parts.push(`UNTIL=${recurrence.end.until.replace(/-/g, '')}T235959Z`);
  }

  return parts.join(';');
}

/**
 * Parse an RFC-5545 RRULE string back into a {@link Recurrence}, or `null` if it
 * isn't one this editor can represent (an unsupported `FREQ`, a malformed token,
 * a non-weekday `BYDAY`, …). The inverse of {@link buildRRule} for the subset the
 * editor emits, so a stored template round-trips into the form; an rrule the
 * editor can't model returns `null` so callers can fall back to a sensible
 * default rather than crash.
 */
export function parseRRule(rrule: string): Recurrence | null {
  const tokens = rrule
    .trim()
    .replace(/^RRULE:/i, '')
    .split(';')
    .filter((part) => part.length > 0);

  const map = new Map<string, string>();
  for (const token of tokens) {
    const eq = token.indexOf('=');
    if (eq === -1) {
      return null;
    }
    map.set(token.slice(0, eq).toUpperCase(), token.slice(eq + 1));
  }

  const freqRaw = map.get('FREQ');
  const freq = recurrenceFreqSchema.safeParse(freqRaw);
  if (!freq.success) {
    return null;
  }

  let interval = 1;
  if (map.has('INTERVAL')) {
    interval = Number(map.get('INTERVAL'));
    if (!Number.isInteger(interval) || interval < 1) {
      return null;
    }
  }

  let weekdays: RecurrenceWeekday[] = [];
  if (map.has('BYDAY')) {
    const days = map.get('BYDAY')!.split(',').filter(Boolean);
    const parsed = z.array(recurrenceWeekdaySchema).safeParse(days);
    if (!parsed.success) {
      return null;
    }
    weekdays = RECURRENCE_WEEKDAYS.filter((day) => parsed.data.includes(day));
  }

  let end: RecurrenceEnd = { type: 'never' };
  if (map.has('COUNT')) {
    const count = Number(map.get('COUNT'));
    if (!Number.isInteger(count) || count < 1) {
      return null;
    }
    end = { type: 'count', count };
  } else if (map.has('UNTIL')) {
    const until = map.get('UNTIL')!;
    const match = until.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!match) {
      return null;
    }
    end = { type: 'until', until: `${match[1]}-${match[2]}-${match[3]}` };
  }

  const result = recurrenceSchema.safeParse({ freq: freq.data, interval, weekdays, end });
  return result.success ? result.data : null;
}

/** Full weekday names keyed by RFC-5545 code, for the human summary. */
const WEEKDAY_NAMES: Record<RecurrenceWeekday, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};

/** The singular noun per frequency, used to build "every 2 weeks" etc. */
const FREQ_NOUN: Record<RecurrenceFreq, string> = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
};

/**
 * Render a {@link Recurrence} as a short, human sentence the editor and the
 * roster show beside the raw rrule, e.g. "Every 2 weeks on Mon, Wed · until Dec
 * 31, 2026". Pure presentation — no locale formatting beyond a plain date — so it
 * is safe on both the server and the client.
 */
export function describeRecurrence(recurrence: Recurrence): string {
  const noun = FREQ_NOUN[recurrence.freq];
  const cadence =
    recurrence.interval === 1
      ? recurrence.freq === 'DAILY'
        ? 'Every day'
        : `Every ${noun}`
      : `Every ${recurrence.interval} ${noun}s`;

  let main = cadence;
  if (recurrence.freq === 'WEEKLY' && recurrence.weekdays.length > 0) {
    const ordered = RECURRENCE_WEEKDAYS.filter((day) => recurrence.weekdays.includes(day));
    main = `${cadence} on ${ordered.map((day) => WEEKDAY_NAMES[day]).join(', ')}`;
  }

  if (recurrence.end.type === 'count') {
    return `${main} · for ${recurrence.end.count} ${
      recurrence.end.count === 1 ? 'occurrence' : 'occurrences'
    }`;
  }
  if (recurrence.end.type === 'until') {
    return `${main} · until ${formatUntil(recurrence.end.until)}`;
  }
  return main;
}

/** Format a `YYYY-MM-DD` as `Mon DD, YYYY` without pulling in a date library. */
function formatUntil(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Describe an rrule string directly — parse it, then {@link describeRecurrence}
 * the result, falling back to the raw string when it isn't a recurrence the
 * editor can model (so the roster still shows *something* meaningful).
 */
export function describeRRule(rrule: string): string {
  const recurrence = parseRRule(rrule);
  return recurrence ? describeRecurrence(recurrence) : rrule;
}

// ── Roster / detail / write contracts ────────────────────────────────────────

/** Sortable columns for the class-template roster. Mirrors the `orderBy` keys the service maps. */
export const classTemplateSortSchema = z.enum([
  'title',
  'capacity',
  'status',
  'validFrom',
  'createdAt',
]);

/** A column the class-template roster may be sorted by — {@link classTemplateSortSchema}. */
export type ClassTemplateSort = z.infer<typeof classTemplateSortSchema>;

/**
 * Query for `GET /admin/classes`. Pagination is mandatory server-side (`page` is
 * 1-based, `limit` capped at 100); `search` matches the template title/category,
 * `status` narrows the list, and `sort` + `dir` drive ordering. Every field is
 * optional with a sensible default so a bare `GET /admin/classes` is valid.
 * Numbers are coerced because they arrive as query strings.
 */
export const listAdminClassTemplatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: classTemplateStatusSchema.optional(),
  sort: classTemplateSortSchema.default('title'),
  dir: sortDirSchema.default('asc'),
});

/** Validated `GET /admin/classes` query — {@link listAdminClassTemplatesQuerySchema}. */
export type ListAdminClassTemplatesQuery = z.infer<typeof listAdminClassTemplatesQuerySchema>;

/**
 * One class template as the roster table renders it. `recurrence` is the
 * human-readable cadence ({@link describeRRule} of the stored rrule), so the
 * table shows "Every week on Mon, Wed" without re-parsing client-side.
 * `trainerName` / `locationName` are the denormalised default trainer/branch
 * names (`null` when unset). `validFrom` / `validUntil` are `YYYY-MM-DD` dates the
 * table formats; `createdAt` is an ISO-8601 instant.
 */
export interface AdminClassTemplateRow {
  id: string;
  title: string;
  category: string;
  capacity: number;
  durationMinutes: number;
  recurrence: string;
  color: string;
  trainerName: string | null;
  locationName: string | null;
  status: ClassTemplateStatus;
  pricingRule: ClassPricingRule;
  priceMinor: number | null;
  includedPlanIds: string[];
  minAttendance: number | null;
  pt30Minor: number | null;
  pt45Minor: number | null;
  pt60Minor: number | null;
  validFrom: string;
  validUntil: string | null;
  createdAt: string;
}

/**
 * Successful `GET /admin/classes` response — one page of the roster plus the
 * totals the pager needs. `total` is the count *after* filters, `page` / `limit`
 * echo the request. An empty `data` is a normal result the table renders as its
 * empty state.
 */
export interface ListAdminClassTemplatesResponse {
  data: AdminClassTemplateRow[];
  total: number;
  page: number;
  limit: number;
}

/**
 * One class template as the detail / edit page needs it — the roster row plus the
 * `description`, the raw `rrule` string (so the visual editor can re-parse it),
 * the `trainerId` / `locationId` / `room` defaults, and the `updatedAt` instant.
 * A missing / cross-tenant id is a `404`, not an empty body, so the page
 * distinguishes "no such template" from a valid record.
 */
export interface AdminClassTemplateDetail extends AdminClassTemplateRow {
  description: string;
  rrule: string;
  trainerId: string | null;
  locationId: string | null;
  room: string | null;
  updatedAt: string;
}

/** Successful `GET /admin/classes/:id` response — the template detail spread flat. */
export type GetAdminClassTemplateResponse = AdminClassTemplateDetail;

/** Max length of the stored rrule string, mirroring the DB `rrule_max_len` check (T5.1). */
export const MAX_RRULE_LENGTH = 500;

/**
 * The editable class-template fields shared by the create + update bodies. `title`
 * is required; `description` / `category` / `room` are free text (empty allowed).
 * `trainerId` / `locationId` are optional foreign keys (`null` = unset). `capacity`
 * and `durationMinutes` are positive integers. `rrule` is the RFC-5545 string the
 * visual editor produces — re-validated here so a hand-edited body still has to be
 * a recurrence the system can model (and within the DB's length ceiling). `color`
 * is a hex calendar colour. `validFrom` is the inclusive start date; `validUntil`
 * is an optional inclusive end date (`null` = open-ended), which must not precede
 * `validFrom`. Numbers are coerced because the admin form submits them as strings.
 */
const classTemplateProfileFields = {
  title: z.string().trim().min(1, 'Title is required').max(160),
  description: z.string().trim().max(2000).default(''),
  category: z.string().trim().max(80).default(''),
  trainerId: z.string().trim().min(1).nullable().default(null),
  locationId: z.string().trim().min(1).nullable().default(null),
  room: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .default(null)
    // An empty room string is normalised to null so "no room" has one representation.
    .transform((value) => (value === null || value === '' ? null : value)),
  capacity: z.coerce
    .number()
    .int('Capacity must be a whole number')
    .min(1, 'Capacity must be at least 1')
    .max(100000),
  durationMinutes: z.coerce
    .number()
    .int('Duration must be a whole number of minutes')
    .min(1, 'Duration must be at least 1 minute')
    .max(1440, 'Duration cannot exceed 24 hours'),
  rrule: z
    .string()
    .trim()
    .min(1, 'A recurrence is required')
    .max(MAX_RRULE_LENGTH, `The recurrence rule cannot exceed ${MAX_RRULE_LENGTH} characters`)
    .refine((value) => parseRRule(value) !== null, 'The recurrence rule is not valid'),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #2563eb')
    .default('#2563eb'),
  pricingRule: classPricingRuleSchema.default('FREE'),
  priceMinor: nullableMinorField.default(null),
  includedPlanIds: z.array(z.string().trim().min(1)).max(100).default([]),
  minAttendance: z
    .preprocess(
      (value) => (value === '' || value === null || value === undefined ? null : value),
      z.coerce.number().int().min(0).max(100_000).nullable(),
    )
    .default(null),
  pt30Minor: nullableMinorField.default(null),
  pt45Minor: nullableMinorField.default(null),
  pt60Minor: nullableMinorField.default(null),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be a YYYY-MM-DD date'),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be a YYYY-MM-DD date')
    .nullable()
    .default(null),
};

/**
 * Shared pricing guard: a `PAID` template needs a per-session `priceMinor`, and an
 * `INCLUDED` template needs at least one plan in `includedPlanIds`. `FREE` clears
 * both. Keeps the wire from carrying a pricing rule the UI can't act on.
 */
function refinePricing(
  value: {
    pricingRule: ClassPricingRule;
    priceMinor: number | null;
    includedPlanIds: string[];
  },
  ctx: z.RefinementCtx,
): void {
  if (value.pricingRule === 'PAID' && (value.priceMinor === null || value.priceMinor <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A paid class needs a price above zero',
      path: ['priceMinor'],
    });
  }
  if (value.pricingRule === 'INCLUDED' && value.includedPlanIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Pick at least one plan this class is included in',
      path: ['includedPlanIds'],
    });
  }
}

/** Shared `validUntil >= validFrom` guard applied to both write bodies. */
function refineValidWindow(
  value: { validFrom: string; validUntil: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.validUntil !== null && value.validUntil < value.validFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date must be on or after the start date',
      path: ['validUntil'],
    });
  }
}

/**
 * Body for `POST /admin/classes` — create a class template (T5.2). The profile
 * fields plus an initial `status` that defaults to `ACTIVE` (a staff-added
 * template starts generating occurrences unless explicitly created paused). The
 * API re-validates with this exact schema, so the admin form and the controller
 * can never drift.
 */
export const createClassTemplateSchema = z
  .object({
    ...classTemplateProfileFields,
    status: classTemplateStatusSchema.default('ACTIVE'),
  })
  .superRefine(refineValidWindow)
  .superRefine(refinePricing);

/** Validated `POST /admin/classes` body — {@link createClassTemplateSchema}. */
export type CreateClassTemplateInput = z.input<typeof createClassTemplateSchema>;

/** Parsed `POST /admin/classes` body (after defaults/transforms applied). */
export type CreateClassTemplateData = z.infer<typeof createClassTemplateSchema>;

/**
 * Body for `PATCH /admin/classes/:id` — edit a class template (T5.2). The same
 * mutable profile fields as create; `status` is changed through the dedicated
 * pause / resume actions, not here.
 */
export const updateClassTemplateSchema = z
  .object(classTemplateProfileFields)
  .superRefine(refineValidWindow)
  .superRefine(refinePricing);

/** Validated `PATCH /admin/classes/:id` body — {@link updateClassTemplateSchema}. */
export type UpdateClassTemplateInput = z.input<typeof updateClassTemplateSchema>;

/** Parsed `PATCH /admin/classes/:id` body (after defaults/transforms applied). */
export type UpdateClassTemplateData = z.infer<typeof updateClassTemplateSchema>;

/**
 * Successful `POST /admin/classes` response (`201 Created`) — the newly created
 * class template as the detail page renders it.
 */
export type CreateClassTemplateResponse = AdminClassTemplateDetail;

/** Successful `PATCH /admin/classes/:id` response — the updated template detail. */
export type UpdateClassTemplateResponse = AdminClassTemplateDetail;

/**
 * Successful `POST /admin/classes/:id/pause` and `.../resume` response — the
 * template detail with the new `status` (`PAUSED` / `ACTIVE`).
 */
export type SetClassTemplateStatusResponse = AdminClassTemplateDetail;
