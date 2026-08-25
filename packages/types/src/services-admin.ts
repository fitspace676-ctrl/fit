// @fit/types — the Services catalogue wire contract (design:
// docs/superpowers/specs/2026-08-25-services-design.md, stage 1).
//
// A service is a staff-delivered, priced thing a gym sells at the desk: a
// personal-training hour bound to a trainer, or a custom one (a massage) named by
// staff. The admin form and `POST /admin/services` share these schemas, so the
// two can never drift.

import { z } from 'zod';
import {
  recurrenceFreqSchema,
  recurrenceWeekdaySchema,
  type RecurrenceWeekday,
} from './classes-admin';
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
 * When a CUSTOM service runs. The classes-admin recurrence vocabulary plus a
 * start date, a start time and an optional end date. `weekdays` only applies to
 * `WEEKLY` (and is then required); the API expands this into sessions in stage 2.
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

/** The fields every service carries, whatever its type. */
const serviceProfileFields = {
  staffId: z.string().trim().min(1, 'Pick a staff member'),
  priceMinor: z.number().int().nonnegative(),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  description: z.string().trim().max(2000).default(''),
};

/**
 * Body for `POST /admin/services`, discriminated on `type`. A PT service has no
 * `name` (generated from its trainer) and no `schedule`; a CUSTOM one needs both.
 */
export const createServiceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('PERSONAL_TRAINING'), ...serviceProfileFields }),
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
 * Body for `PATCH /admin/services/:id`. `type` is immutable. `name` and `schedule`
 * are ignored by the API on a PT service (its name is regenerated when `staffId`
 * changes).
 */
export const updateServiceSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  staffId: z.string().trim().min(1).optional(),
  priceMinor: z.number().int().nonnegative().optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  description: z.string().trim().max(2000).optional(),
  schedule: serviceScheduleSchema.optional(),
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

const WEEKDAY_LABEL: Record<RecurrenceWeekday, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};

/** `"2026-09-01"` → `"1 Sep 2026"`, locale-independent (admin copy is English). */
function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${day} ${months[(month ?? 1) - 1]} ${year}`;
}

/**
 * A schedule in words for the roster row: `"Every Mon, Wed · 18:00"`,
 * `"Daily · 09:00"`, `"Once · 3 Sep 2026 · 18:00"`, each with `" · until <date>"`
 * when an end date is set.
 */
export function formatServiceSchedule(schedule: ServiceSchedule): string {
  const head =
    schedule.freq === 'WEEKLY'
      ? `Every ${schedule.weekdays.map((day) => WEEKDAY_LABEL[day]).join(', ')}`
      : schedule.freq === 'DAILY'
        ? 'Daily'
        : `Once · ${formatIsoDate(schedule.startDate)}`;
  const until = schedule.until ? ` · until ${formatIsoDate(schedule.until)}` : '';
  return `${head} · ${schedule.startTime}${until}`;
}
