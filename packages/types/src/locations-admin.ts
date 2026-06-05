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
 * One day's opening hours. `closed` marks the branch shut that day (the times are
 * ignored and not rendered); otherwise `open`/`close` are `HH:MM` 24-hour times,
 * with `close` required to fall after `open`. Every field defaults so a bare `{}`
 * parses to a sensible 09:00–17:00 open day.
 */
export const dayHoursSchema = z
  .object({
    closed: z.boolean().default(false),
    open: z.string().regex(TIME_PATTERN, 'Time must be HH:MM').default('09:00'),
    close: z.string().regex(TIME_PATTERN, 'Time must be HH:MM').default('17:00'),
  })
  .refine((day) => day.closed || day.close > day.open, {
    message: 'Closing time must be after opening time',
    path: ['close'],
  });

/** One day's parsed opening hours — {@link dayHoursSchema}. */
export type DayHours = z.infer<typeof dayHoursSchema>;

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
 * One location as the roster table renders it. `photoUrl` is `null` when the
 * branch has no photo (the table renders a placeholder). `amenities` is the
 * denormalised tag list shown as chips. `createdAt` is an ISO-8601 instant the
 * table formats in the staff member's local zone. The full weekly `hours` are on
 * the {@link AdminLocationDetail}, not the row, to keep the roster light.
 */
export interface AdminLocationRow {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  photoUrl: string | null;
  amenities: string[];
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
 * One location as the detail / edit page needs it — the roster row plus the full
 * weekly `hours` and the `updatedAt` instant. A missing / cross-tenant id is a
 * `404`, not an empty body, so the page distinguishes "no such location" from a
 * valid record.
 */
export interface AdminLocationDetail extends AdminLocationRow {
  hours: LocationHours;
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
