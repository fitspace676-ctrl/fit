// @fit/types — staff-depth contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the deeper Staff console (T12.14): the
// per-staff Notes / Tasks / Time-off / Specialties / Weekly-schedule tabs, the
// gym-wide time-off approval queue, and the read-only Roles & Permissions
// matrix. The API validates inbound bodies with these Zod schemas and the
// `@fit/admin` console reuses the inferred types, so the forms and the
// controller can never drift on the wire format.
//
// "Staff" here are the gym's privileged {@link GymMember}s (every role except a
// plain `MEMBER`); a staff member is addressed by their **membership id** (the
// same `id` the `GET /staff` roster and the re-role / remove routes use), passed
// as `:staffId`. All dates cross the wire as ISO-8601 strings.

import { z } from 'zod';
import { ROLE_PERMISSIONS, type Permission } from './permissions';
import { staffRoleSchema, type StaffRole } from './staff';

/**
 * An ISO-8601 date (or date-time) string the API parses with `new Date(...)`.
 * Validated here so a malformed date is a `400` at the boundary rather than an
 * `Invalid Date` reaching the database.
 */
const isoDateSchema = z
  .string()
  .trim()
  .min(1, 'A date is required')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'A valid date is required');

/** A wall-clock time as `HH:mm` (24-hour), e.g. `09:00` / `18:30`. */
const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm (24-hour)');

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/** Body for `POST /staff/:staffId/notes` — log an internal note about a staff member. */
export const createStaffNoteSchema = z.object({
  body: z.string().trim().min(1, 'A note body is required').max(4000),
});

/** Validated `POST /staff/:staffId/notes` body — {@link createStaffNoteSchema}. */
export type CreateStaffNoteInput = z.infer<typeof createStaffNoteSchema>;

/**
 * One staff note as the Notes tab renders it. `author` is the snapshotted
 * display name of the writer; `createdAt` is an ISO-8601 instant.
 */
export interface StaffNoteRow {
  id: string;
  staffId: string;
  author: string;
  body: string;
  createdAt: string;
}

/** Successful `GET /staff/:staffId/notes` response. */
export interface ListStaffNotesResponse {
  notes: StaffNoteRow[];
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/** Body for `POST /staff/:staffId/tasks` — assign a task to a staff member. */
export const createStaffTaskSchema = z.object({
  title: z.string().trim().min(1, 'A task title is required').max(200),
  description: z.string().trim().max(4000).optional(),
  dueDate: isoDateSchema.optional(),
});

/** Validated `POST /staff/:staffId/tasks` body — {@link createStaffTaskSchema}. */
export type CreateStaffTaskInput = z.infer<typeof createStaffTaskSchema>;

/**
 * Body for `PATCH /staff/tasks/:taskId` — edit a task or toggle its completion.
 * Every field is optional; at least one must be present. Passing `dueDate: null`
 * clears the due date; `completed` toggles the done state (stamping `completedAt`).
 */
export const updateStaffTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    dueDate: isoDateSchema.nullable().optional(),
    completed: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

/** Validated `PATCH /staff/tasks/:taskId` body — {@link updateStaffTaskSchema}. */
export type UpdateStaffTaskInput = z.infer<typeof updateStaffTaskSchema>;

/**
 * One assigned task as the Tasks tab renders it. `dueDate` / `completedAt` are
 * ISO-8601 instants when set; `assignedBy` is the snapshotted assigner name.
 */
export interface StaffTaskRow {
  id: string;
  staffId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  completed: boolean;
  completedAt: string | null;
  assignedBy: string | null;
  createdAt: string;
}

/** Successful `GET /staff/:staffId/tasks` response. */
export interface ListStaffTasksResponse {
  tasks: StaffTaskRow[];
}

// ---------------------------------------------------------------------------
// Time off
// ---------------------------------------------------------------------------

/** A time-off request's lifecycle — mirrors the Prisma `TimeOffStatus` enum. */
export const timeOffStatusSchema = z.enum(['pending', 'approved', 'denied']);

/** A time-off request's status — {@link timeOffStatusSchema}. */
export type TimeOffStatus = z.infer<typeof timeOffStatusSchema>;

/** Body for `POST /staff/:staffId/time-off` — request time off for a staff member. */
export const createTimeOffRequestSchema = z
  .object({
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    reason: z.string().trim().max(2000).optional(),
  })
  .refine((value) => Date.parse(value.endDate) >= Date.parse(value.startDate), {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

/** Validated `POST /staff/:staffId/time-off` body — {@link createTimeOffRequestSchema}. */
export type CreateTimeOffRequestInput = z.infer<typeof createTimeOffRequestSchema>;

/** Body for `PATCH /staff/time-off/:requestId/decision` — approve or deny a request. */
export const decideTimeOffRequestSchema = z.object({
  decision: z.enum(['approve', 'deny']),
});

/** Validated decision body — {@link decideTimeOffRequestSchema}. */
export type DecideTimeOffRequestInput = z.infer<typeof decideTimeOffRequestSchema>;

/** Query for `GET /staff/time-off` — filter the gym-wide queue by status / staff. */
export const listTimeOffQuerySchema = z.object({
  status: timeOffStatusSchema.optional(),
  staffId: z.string().trim().min(1).optional(),
});

/** Validated `GET /staff/time-off` query — {@link listTimeOffQuerySchema}. */
export type ListTimeOffQuery = z.infer<typeof listTimeOffQuerySchema>;

/**
 * One time-off request as the calendar tab and approval queue render it.
 * `staffName` denormalises the requester so the gym-wide queue needs no join on
 * the client; `decidedBy` / `decidedAt` are set once a manager acts.
 */
export interface TimeOffRequestRow {
  id: string;
  staffId: string;
  staffName: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: TimeOffStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

/** Successful `GET /staff/time-off` (and `GET /staff/:staffId/time-off`) response. */
export interface ListTimeOffResponse {
  requests: TimeOffRequestRow[];
}

// ---------------------------------------------------------------------------
// Specialties
// ---------------------------------------------------------------------------

/** Body for `POST /staff/:staffId/specialties` — tag a staff member with a specialty. */
export const addStaffSpecialtySchema = z.object({
  name: z.string().trim().min(1, 'A specialty name is required').max(80),
});

/** Validated `POST /staff/:staffId/specialties` body — {@link addStaffSpecialtySchema}. */
export type AddStaffSpecialtyInput = z.infer<typeof addStaffSpecialtySchema>;

/** One specialty tag on a staff member. */
export interface StaffSpecialtyRow {
  id: string;
  staffId: string;
  name: string;
}

/** Successful `GET /staff/:staffId/specialties` response. */
export interface ListStaffSpecialtiesResponse {
  specialties: StaffSpecialtyRow[];
}

// ---------------------------------------------------------------------------
// Weekly schedule (shifts)
// ---------------------------------------------------------------------------

/** One shift in the weekly-schedule editor. `dayOfWeek` is 0 (Mon) … 6 (Sun). */
export const shiftSlotInputSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
    location: z.string().trim().max(120).optional(),
  })
  .refine((value) => value.endTime > value.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

/**
 * Body for `PUT /staff/:staffId/schedule` — replace a staff member's whole
 * weekly schedule with the given shifts (a set-based editor: the sent list
 * becomes the schedule). An empty list clears the schedule.
 */
export const updateStaffScheduleSchema = z.object({
  shifts: z.array(shiftSlotInputSchema).max(50),
});

/** Validated `PUT /staff/:staffId/schedule` body — {@link updateStaffScheduleSchema}. */
export type UpdateStaffScheduleInput = z.infer<typeof updateStaffScheduleSchema>;

/** One shift as the calendar grid renders it. */
export interface ShiftSlotRow {
  id: string;
  staffId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location: string | null;
}

/** Successful `GET /staff/:staffId/schedule` (and the `PUT` echo) response. */
export interface StaffScheduleResponse {
  shifts: ShiftSlotRow[];
}

// ---------------------------------------------------------------------------
// Roles & permissions matrix
// ---------------------------------------------------------------------------

/** One staff role and the flat set of permissions it grants. */
export interface StaffRolePermissions {
  role: StaffRole;
  permissions: Permission[];
}

/** Successful `GET /staff/roles` response — the read-only roles/permissions matrix. */
export interface ListStaffRolesResponse {
  roles: StaffRolePermissions[];
}

/**
 * The staff roles in high-to-low privilege order — the rows of the Roles &
 * Permissions matrix. `MEMBER` and `SUPER_ADMIN` are excluded (a customer and
 * the platform-wide role, neither a gym staff role), matching
 * {@link staffRoleSchema}.
 */
export const STAFF_ROLE_ORDER = staffRoleSchema.options;

/**
 * Build the read-only Staff roles/permissions matrix from the single-source
 * {@link ROLE_PERMISSIONS} map — each staff role paired with the permissions it
 * grants. Shared so the API `GET /staff/roles` handler and any client render off
 * the exact same authorization data instead of re-listing it.
 */
export function staffRolePermissionMatrix(): StaffRolePermissions[] {
  return STAFF_ROLE_ORDER.map((role) => ({
    role,
    permissions: [...ROLE_PERMISSIONS[role]],
  }));
}
