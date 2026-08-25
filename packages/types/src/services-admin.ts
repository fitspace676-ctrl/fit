// @fit/types — the Services catalogue wire contract (design:
// docs/superpowers/specs/2026-08-25-services-design.md, stage 1).
//
// A service is a staff-delivered, priced thing a gym sells at the desk: a
// personal-training hour bound to a trainer, or a custom one (a massage) named by
// staff. The admin form and `POST /admin/services` share these schemas, so the
// two can never drift.

import { z } from 'zod';
import { recurrenceFreqSchema, recurrenceWeekdaySchema } from './classes-admin';
import { sortDirSchema } from './members';

export const serviceTypeSchema = z.enum(['PERSONAL_TRAINING', 'CUSTOM']);
export type ServiceType = z.infer<typeof serviceTypeSchema>;

export const serviceStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

/** `YYYY-MM-DD` — a calendar date with no time zone. */
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
/** `HH:MM`, 24-hour. */
const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

/**
 * When a service runs. The classes-admin recurrence vocabulary plus a start
 * date, a start time and an optional end date. `weekdays` only applies to
 * `WEEKLY` (and is then required); the API expands this into sessions in stage 2.
 * Required on a CUSTOM service; optional on a PT one, whose slots otherwise
 * come from the trainer's PT calendar.
 */
export const serviceScheduleSchema = z
  .object({
    freq: recurrenceFreqSchema,
    weekdays: z.array(recurrenceWeekdaySchema).default([]),
    startDate: isoDateSchema,
    startTime: clockTimeSchema,
    until: z
      .preprocess(
        (value) => (value === '' || value === undefined ? null : value),
        isoDateSchema.nullable(),
      )
      .default(null),
  })
  .superRefine((value, ctx) => {
    if (value.freq === 'WEEKLY' && value.weekdays.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pick at least one weekday for a weekly service',
        path: ['weekdays'],
      });
    }
    if (value.until !== null && value.until < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The end date must not be before the start date',
        path: ['until'],
      });
    }
  });

export type ServiceSchedule = z.infer<typeof serviceScheduleSchema>;
export type ServiceScheduleInput = z.input<typeof serviceScheduleSchema>;

/**
 * The optional cover image, as a public URL. `''` and absent both normalise to
 * null so "no cover" has exactly one representation on the wire.
 */
const coverUrlSchema = z
  .preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().url('The cover image must be a URL').max(2048).nullable(),
  )
  .default(null);

/** The fields every service carries, whatever its type. */
const serviceProfileFields = {
  staffId: z.string().trim().min(1, 'Pick a staff member'),
  priceMinor: z.number().int().nonnegative(),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  description: z.string().trim().max(2000).default(''),
  coverUrl: coverUrlSchema,
};

/**
 * Body for `POST /admin/services`, discriminated on `type`. A PT service has no
 * `name` (generated from its trainer) and an optional `schedule`; a CUSTOM one
 * needs both.
 */
export const createServiceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('PERSONAL_TRAINING'),
    schedule: serviceScheduleSchema.nullable().default(null),
    ...serviceProfileFields,
  }),
  z.object({
    type: z.literal('CUSTOM'),
    name: z.string().trim().min(1, 'Give the service a name').max(120),
    schedule: serviceScheduleSchema,
    ...serviceProfileFields,
  }),
]);

export type CreateServiceInput = z.input<typeof createServiceSchema>;
export type CreateServiceData = z.infer<typeof createServiceSchema>;

/**
 * Body for `PATCH /admin/services/:id`. `type` is immutable. `name` is ignored by
 * the API on a PT service (regenerated when `staffId` changes). `schedule: null`
 * clears a PT service's schedule; on a CUSTOM service the API rejects it
 * (`SERVICE_SCHEDULE_REQUIRED`).
 */
export const updateServiceSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  staffId: z.string().trim().min(1).optional(),
  priceMinor: z.number().int().nonnegative().optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  description: z.string().trim().max(2000).optional(),
  schedule: serviceScheduleSchema.nullable().optional(),
  coverUrl: coverUrlSchema.optional(),
});

export type UpdateServiceData = z.infer<typeof updateServiceSchema>;

export const serviceSortSchema = z.enum(['name', 'price', 'createdAt']);

/** Query for `GET /admin/services`. Numbers are coerced from query strings. */
export const listAdminServicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  type: serviceTypeSchema.optional(),
  status: serviceStatusSchema.default('ACTIVE'),
  staffId: z.string().trim().min(1).optional(),
  sort: serviceSortSchema.default('name'),
  dir: sortDirSchema.default('asc'),
});

export type ListAdminServicesQuery = z.infer<typeof listAdminServicesQuerySchema>;

/** The staff member on a service row. */
export interface AdminServiceStaff {
  id: string;
  name: string;
  photoUrl: string | null;
  isTrainer: boolean;
}

/** One service as the admin roster and POS render it. */
export interface AdminServiceRow {
  id: string;
  type: ServiceType;
  name: string;
  staff: AdminServiceStaff;
  priceMinor: number;
  currency: string;
  durationMinutes: number;
  description: string;
  schedule: ServiceSchedule | null;
  coverUrl: string | null;
  status: ServiceStatus;
  createdAt: string;
}

/** Whole-set counts for the roster's KPI tiles (independent of the page). */
export interface ServiceRosterSummary {
  total: number;
  personalTraining: number;
  custom: number;
  archived: number;
}

export interface ListAdminServicesResponse {
  data: AdminServiceRow[];
  total: number;
  page: number;
  limit: number;
  summary: ServiceRosterSummary;
}

export type ServiceResponse = AdminServiceRow;

/** A staff member the service form can pick — `GET /admin/services/staff`. */
export interface ServiceStaffOption {
  id: string;
  name: string;
  role: string;
  photoUrl: string | null;
  isTrainer: boolean;
}

export interface ListServiceStaffResponse {
  data: ServiceStaffOption[];
}

// ── Member portal (public catalogue) ─────────────────────────────────────────

/**
 * Query for the public `GET /services?gymId=<id>` — the member portal's
 * catalogue. Like `/trainers` and `/products` the route is unauthenticated and
 * the gym is named explicitly (resolved from the subdomain), not by a session.
 */
export const listServicesQuerySchema = z.object({
  gymId: z.string().min(1),
});

export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>;

/** One ACTIVE service as the member portal renders it. Parsed client-side. */
export const serviceCardSchema = z.object({
  id: z.string(),
  type: serviceTypeSchema,
  name: z.string(),
  description: z.string(),
  priceMinor: z.number().int(),
  currency: z.string(),
  durationMinutes: z.number().int(),
  coverUrl: z.string().nullable(),
  schedule: serviceScheduleSchema.nullable(),
  staff: z.object({
    id: z.string(),
    name: z.string(),
    photoUrl: z.string().nullable(),
  }),
});

export type ServiceCard = z.infer<typeof serviceCardSchema>;

export interface ListServicesResponse {
  services: ServiceCard[];
}
