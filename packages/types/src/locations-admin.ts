// @fit/types — location admin contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the staff console's location management
// (T4.5): the paginated `GET /admin/locations` roster the admin table renders, the
// `GET /admin/locations/:id` detail view, and the create / edit / deactivate
// writes. The API validates inbound queries/bodies with these Zod schemas and the
// `@fit/admin` console reuses the inferred types, so the table / form and the
// controller can never drift on the wire format.
//
// Distinct from the *public* location-discovery contracts in `locations.ts` (T3.8):
// those are the denormalised summary card the purchase wizard browses (a flat
// `amenities` list and a `hours` map of display strings); these are the editable
// management record a gym curates (structured weekly `hours` with open/close
// times). Both project the same underlying `Location` model — the admin write is
// the source the public read surfaces.

import { z } from 'zod';
import { sortDirSchema } from './members';

/**
 * A location's lifecycle within the gym, mirroring the Prisma `LocationStatus`
 * enum. `ACTIVE` is a current branch (and the only state the public listing
 * surfaces); `INACTIVE` is soft-deactivated — hidden but retained (T4.5). The
 * roster filter and the status badge both key off this.
 */
export const locationStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

/** A location's lifecycle state — {@link locationStatusSchema}. */
export type LocationStatus = z.infer<typeof locationStatusSchema>;

/** Sortable columns for the location roster. Mirrors the `orderBy` keys the service maps. */
export const locationSortSchema = z.enum(['name', 'status', 'createdAt']);

/** A column the location roster may be sorted by — {@link locationSortSchema}. */
export type LocationSort = z.infer<typeof locationSortSchema>;

/**
 * The weekday keys a location's opening hours are keyed by, lowercase and ordered
 * Monday-first. The same keys the public summary's `hours` display map uses, so
 * the admin edit and the public read agree on the shape.
 */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** One weekday key — a member of {@link WEEKDAYS}. */
export type Weekday = (typeof WEEKDAYS)[number];

/** Human labels for the weekday keys, for the form column headers. */
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/** `HH:MM` 24-hour time, e.g. `06:00` or `23:30`. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The closing time that means "midnight at the *end* of this day", i.e. 24:00.
 *
 * `00:00` is the one clock value that is both the earliest and the latest moment
 * of a day, and a gym that shuts at midnight naturally types it. Read as the
 * earliest it fails "close after open" for every opening time, which is why gyms
 * were settling for `23:59` — a minute short of when they actually close.
 */
export const MIDNIGHT_CLOSE = '00:00';

/**
 * How {@link MIDNIGHT_CLOSE} is *rendered*: the end of the day, not the start of
 * it. `00:00` is the storage encoding, and letting it leak into display gives a
 * card `06:00–00:00` — a window that reads as ending before it starts.
 */
export const MIDNIGHT_CLOSE_LABEL = '24:00';

/**
 * The label a shut day renders as.
 *
 * Deliberately an English literal: the {@link import('./locations').locationSummarySchema}
 * contract documents it, and nothing the API returns in an HTTP body is localised
 * today — the public clients translate with `next-intl` at render time. Localising
 * it here would mean either threading `Accept-Language` into a route that takes no
 * headers, or changing the public contract to carry structured hours the client
 * formats itself; the latter is the right fix and a separate decision.
 */
export const CLOSED_LABEL = 'Closed';

/** The en dash a `06:00–23:00` range is written with. */
const HOURS_SEPARATOR = '–';

/**
 * Whether a day's `open`/`close` pair describes a real window. Times are
 * zero-padded 24-hour strings, so a lexical compare is a correct time compare —
 * except for {@link MIDNIGHT_CLOSE}, which is end-of-day and therefore later than
 * every opening time. Shared by the schema and by both admin forms so the
 * client-side message and the API's rejection can never disagree.
 */
export function isValidDayWindow(open: string, close: string): boolean {
  return close === MIDNIGHT_CLOSE || close > open;
}

/**
 * One day's opening hours. `closed` marks the branch shut that day (the times are
 * ignored and not rendered); otherwise `open`/`close` are `HH:MM` 24-hour times,
 * with `close` required to fall after `open` — or to be {@link MIDNIGHT_CLOSE},
 * which closes the day at 24:00. Every field defaults so a bare `{}` parses to a
 * sensible 09:00–17:00 open day.
 */
export const dayHoursSchema = z
  .object({
    closed: z.boolean().default(false),
    open: z.string().regex(TIME_PATTERN, 'Time must be HH:MM').default('09:00'),
    close: z.string().regex(TIME_PATTERN, 'Time must be HH:MM').default('17:00'),
  })
  .refine((day) => day.closed || isValidDayWindow(day.open, day.close), {
    message: 'Closing time must be after opening time',
    path: ['close'],
  });

/** One day's parsed opening hours — {@link dayHoursSchema}. */
export type DayHours = z.infer<typeof dayHoursSchema>;

/**
 * One day's hours as a display string, e.g. `06:00–23:00`, `06:00–24:00`, or
 * `Closed`.
 *
 * The single rendering both surfaces read from: the staff console's roster /
 * detail page and the public `GET /locations` projection. They used to format
 * independently and disagreed on the midnight case — staff saw `06:00–00:00`
 * where a visitor saw `06:00–24:00` for the same branch — so it lives here,
 * beside the {@link MIDNIGHT_CLOSE} encoding it has to know about.
 *
 * A `closed` day is {@link CLOSED_LABEL} and its times are ignored, matching
 * {@link dayHoursSchema}, which does not validate them either. Otherwise the
 * zero-padded `HH:MM` times are joined with an en dash, with {@link MIDNIGHT_CLOSE}
 * rendered as {@link MIDNIGHT_CLOSE_LABEL}.
 *
 * Takes an already-parsed {@link DayHours}: what to do with a day that is absent
 * or does not parse is the caller's policy, not this function's. The admin form
 * always has seven days (every one defaults), while the public projection omits
 * a day the gym never entered rather than publishing invented hours.
 */
export function formatDayHours(day: DayHours): string {
  if (day.closed) {
    return CLOSED_LABEL;
  }
  const close = day.close === MIDNIGHT_CLOSE ? MIDNIGHT_CLOSE_LABEL : day.close;
  return `${day.open}${HOURS_SEPARATOR}${close}`;
}

/**
 * A location's full weekly opening hours — one {@link dayHoursSchema} per weekday.
 * Each day defaults, so an absent day (or a bare `{}` whole-week value) is filled
 * with the 09:00–17:00 open default; the API always stores and returns a complete
 * seven-day map so the form and the public projection never have to guess.
 */
export const locationHoursSchema = z.object({
  mon: dayHoursSchema.default({}),
  tue: dayHoursSchema.default({}),
  wed: dayHoursSchema.default({}),
  thu: dayHoursSchema.default({}),
  fri: dayHoursSchema.default({}),
  sat: dayHoursSchema.default({}),
  sun: dayHoursSchema.default({}),
});

/** A location's parsed weekly hours — {@link locationHoursSchema}. */
export type LocationHours = z.infer<typeof locationHoursSchema>;

/**
 * Query for `GET /admin/locations`. Pagination is mandatory server-side (`page` is
 * 1-based, `limit` capped at 100); `search` matches the location name/address,
 * `status` narrows the list, and `sort` + `dir` drive ordering. Every field is
 * optional with a sensible default so a bare `GET /admin/locations` is valid.
 * Numbers are coerced because they arrive as query strings.
 */
export const listAdminLocationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: locationStatusSchema.optional(),
  sort: locationSortSchema.default('name'),
  dir: sortDirSchema.default('asc'),
});

/** Validated `GET /admin/locations` query — {@link listAdminLocationsQuerySchema}. */
export type ListAdminLocationsQuery = z.infer<typeof listAdminLocationsQuerySchema>;

/**
 * One location as the roster renders it. `photoUrl` is `null` when the branch has
 * no photo (the card renders a placeholder). `amenities` is the denormalised tag
 * list shown as chips. `hours` is the full weekly opening-hours map so the
 * formacore location cards can surface today's hours and a live open/closed state
 * without a per-card detail fetch — the stored `hours` JSON is already selected,
 * so projecting it onto the row costs nothing. `createdAt` is an ISO-8601 instant
 * the roster formats in the staff member's local zone.
 */
export interface AdminLocationRow {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  photoUrl: string | null;
  amenities: string[];
  hours: LocationHours;
  status: LocationStatus;
  createdAt: string;
}

/**
 * Successful `GET /admin/locations` response — one page of the roster plus the
 * totals the pager needs. `total` is the count *after* filters, `page` / `limit`
 * echo the request. An empty `data` is a normal result the table renders as its
 * empty state.
 */
export interface ListAdminLocationsResponse {
  data: AdminLocationRow[];
  total: number;
  page: number;
  limit: number;
}

/**
 * One location as the detail / edit page needs it — the roster row (which already
 * carries the weekly `hours`) plus the `updatedAt` instant. A missing /
 * cross-tenant id is a `404`, not an empty body, so the page distinguishes "no
 * such location" from a valid record.
 */
export interface AdminLocationDetail extends AdminLocationRow {
  updatedAt: string;
}

/** Successful `GET /admin/locations/:id` response — the location detail spread flat. */
export type GetAdminLocationResponse = AdminLocationDetail;

/**
 * The editable location fields shared by the create + update bodies. `name` is
 * required; `address` is free text (empty allowed, normalised to `''`); `phone`
 * is an optional contact string or `null`. `photoUrl` is the R2 public URL of the
 * uploaded photo — a valid URL or `null`; an empty string is treated as "no
 * photo" (`null`). `amenities` is a de-duplicated, trimmed tag list (each 1–60
 * chars), capped so the roster chips stay sane. `hours` is the full weekly map,
 * defaulted to an open 09:00–17:00 week.
 */
const locationProfileFields = {
  name: z.string().trim().min(1, 'Name is required').max(120),
  address: z.string().trim().max(300).default(''),
  phone: z
    .union([z.string().trim().max(40), z.literal(''), z.null()])
    .optional()
    .transform((value) => (value ? value : null)),
  photoUrl: z
    .union([
      z.string().trim().max(2048).url('Photo URL must be a valid URL'),
      z.literal(''),
      z.null(),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  amenities: z
    .array(z.string().trim().min(1).max(60))
    .max(30, 'A location can have at most 30 amenities')
    .default([])
    .transform((tags) => Array.from(new Set(tags.filter((tag) => tag.length > 0)))),
  hours: locationHoursSchema.default({}),
};

/**
 * Body for `POST /admin/locations` — create a location (T4.5). The profile fields
 * plus an initial `status` that defaults to `ACTIVE` (a staff-added branch is live
 * unless explicitly created inactive). The API re-validates with this exact
 * schema, so the admin form and the controller can never drift.
 */
export const createLocationSchema = z.object({
  ...locationProfileFields,
  status: locationStatusSchema.default('ACTIVE'),
});

/** Validated `POST /admin/locations` body — {@link createLocationSchema}. */
export type CreateLocationInput = z.input<typeof createLocationSchema>;

/** Parsed `POST /admin/locations` body (after defaults/transforms applied). */
export type CreateLocationData = z.infer<typeof createLocationSchema>;

/**
 * Body for `PATCH /admin/locations/:id` — edit a location (T4.5). The same mutable
 * profile fields as create; `status` is changed through the dedicated deactivate /
 * reactivate actions, not here.
 */
export const updateLocationSchema = z.object(locationProfileFields);

/** Validated `PATCH /admin/locations/:id` body — {@link updateLocationSchema}. */
export type UpdateLocationInput = z.input<typeof updateLocationSchema>;

/** Parsed `PATCH /admin/locations/:id` body (after defaults/transforms applied). */
export type UpdateLocationData = z.infer<typeof updateLocationSchema>;

/**
 * Successful `POST /admin/locations` response (`201 Created`) — the newly created
 * location as the detail page renders it.
 */
export type CreateLocationResponse = AdminLocationDetail;

/** Successful `PATCH /admin/locations/:id` response — the updated location detail. */
export type UpdateLocationResponse = AdminLocationDetail;

/**
 * Successful `POST /admin/locations/:id/deactivate` and `.../reactivate` response —
 * the location detail with the new `status` (`INACTIVE` / `ACTIVE`).
 */
export type SetLocationStatusResponse = AdminLocationDetail;

// ---------------------------------------------------------------------------
// Branch exclusivity — the Stage 7 catalogue contract, shared by six modules
// ---------------------------------------------------------------------------

/**
 * The branch-exclusivity field a **catalogue** body carries: the one branch this
 * item is exclusive to, or `null` for the gym-wide default.
 *
 * > **`null` means AVAILABLE AT EVERY BRANCH.** This is the opposite of every
 * > other `locationId` on the wire — `createMemberSchema`'s is the member's home
 * > branch, `createClassInstanceSchema`'s is where the class runs, POS's is the
 * > till. Those attribute a row to one place. This one says an item is *restricted*
 * > to one place, and saying nothing is the normal answer.
 *
 * Shared verbatim by `SubscriptionPlan`, `PackagePlan`, `Product`, `ClassType`,
 * `PromoCode` and `LoyaltyReward` so the six forms cannot drift on nullability.
 * It defaults to `null` rather than being `.optional()` because an omitted branch
 * on a create is a positive statement — "sold everywhere" — not a missing field.
 *
 * Nothing about this field is backfilled or defaulted server-side: the console's
 * "All locations" mode must NOT seed a create form with the active branch here,
 * the way it does for a member's home branch. Doing so would silently make every
 * new plan exclusive to whichever branch the operator happened to be looking at.
 */
export const branchExclusivitySchema = z
  .preprocess(
    // A form's empty select submits `''`; it means "every branch", the same as an
    // absent key. Normalised here so all six catalogue forms agree, exactly as
    // `createProductSchema.categoryId` normalises "no shelf".
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().min(1).nullable(),
  )
  .default(null);

/**
 * The branch-exclusivity field on a PATCH body — {@link branchExclusivitySchema}
 * without the default, so an omitted key leaves the item's scope untouched while
 * an explicit `null` widens it back to every branch.
 */
export const branchExclusivityPatchSchema = z
  .preprocess(
    (value) => (value === '' ? null : value),
    z.string().trim().min(1).nullable().optional(),
  )
  .optional();

/**
 * The `locationId` **query** param a catalogue list endpoint accepts: which branch
 * the operator is looking at, or omitted for "all locations".
 *
 * Its effect is deliberately not the effect the same param has on a members,
 * orders or check-ins list. There it means "rows belonging to this branch"; here
 * it means "**what can I sell at this branch**" — everything exclusive to it PLUS
 * everything gym-wide. The API implements it with `availableAtLocation()` in
 * `apps/api/src/common/location-filter.util.ts`, never `atLocation()`; the latter
 * would return only the branch's exclusives, which for most gyms is an empty
 * catalogue.
 *
 * A consequence worth knowing before adding this to a report: the per-branch
 * results OVERLAP and cannot be summed. A gym-wide plan appears under every
 * branch, so counting branch by branch exceeds the gym's plan count.
 */
export const branchAvailabilityQuerySchema = z.string().trim().min(1).optional();
