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
import { timeOfDaySchema } from './time-of-day';
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

/**
 * Query for `GET /staff/time-off` — filter the approval queue by status / staff,
 * and since Stage 6 by branch.
 *
 * `locationId` asks **"whose absence costs THIS branch cover"**, so it reads the
 * staff member's roster assignments (`LocationStaff`) rather than a column on the
 * request. A `TimeOffRequest` carries no branch and should not: a week off is not
 * an event at a place, it is the absence of one.
 *
 * That makes this filter **overlapping, not partitioning** — deliberately. A coach
 * rostered at both sites appears in both branches' queues, because their week off
 * really does leave both short. Per-branch queue lengths therefore sum to MORE
 * than the gym-wide queue, and nothing may treat this as a per-branch head-count of
 * absences. It is the availability half of the Stage 6 rule, and the API's
 * `location-filter.util.ts` states it once for every reader.
 */
export const listTimeOffQuerySchema = z.object({
  status: timeOffStatusSchema.optional(),
  staffId: z.string().trim().min(1).optional(),
  locationId: z.string().trim().min(1).optional(),
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
// Weekly schedule (shifts)
// ---------------------------------------------------------------------------

/**
 * One shift in the weekly-schedule editor. `dayOfWeek` is 0 (Mon) … 6 (Sun).
 *
 * `locationId` is the **branch this shift staffs** — one gym `Location`, because a
 * shift staffs one door. It replaced a free-text `location` field in Stage 6 of
 * multi-branch, and the replacement is not a rename: the old field was a name
 * somebody typed, which looked like a branch, joined to nothing, and drifted the
 * moment a branch was renamed. There is deliberately **no way to write free text
 * here any more** — the surviving strings on old rows are a queue for an operator
 * to resolve (see {@link ShiftSlotRow.unresolvedLocation}), and a schedule editor
 * that could still mint new ones would keep that queue growing forever.
 *
 * Optional, and it stays optional: a rota is a PLAN, so a shift with no branch
 * picked is left unattributed rather than defaulted onto the gym's default branch.
 * Defaulting would assert somebody stood at a door they were never at — unlike a
 * check-in, which really happened and can bear a lossy attribution.
 */
export const shiftSlotInputSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
    locationId: z.string().trim().min(1).optional(),
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

/**
 * One shift as the calendar grid renders it.
 *
 * The branch arrives as **three** fields rather than one, because Stage 6 left
 * three genuinely different states behind and collapsing them would resurrect the
 * ambiguity the free-text column was removed for:
 *
 *  - `locationId` + `locationName` set — the shift staffs a real branch. Render it
 *    as one.
 *  - all three null — the shift is unattributed. It is not "at the main branch";
 *    nothing knows where it is, and it is absent from every branch-filtered read.
 *  - `unresolvedLocation` set — the row carries a surviving free-text label that
 *    **named no branch of this gym**: a typo, a room, a closed site, or a branch
 *    belonging to another tenant. It is a queue item for an operator to resolve
 *    into a real branch, NOT a branch to display as one, and it never satisfies a
 *    branch filter. No write path can create a new one.
 */
export interface ShiftSlotRow {
  id: string;
  staffId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  /** The branch this shift staffs, or `null` when it is unattributed. */
  locationId: string | null;
  /** That branch's display name, resolved through the relation. */
  locationName: string | null;
  /** A surviving free-text label that matched no branch — see the note above. */
  unresolvedLocation: string | null;
}

/** Successful `GET /staff/:staffId/schedule` (and the `PUT` echo) response. */
export interface StaffScheduleResponse {
  shifts: ShiftSlotRow[];
}

/**
 * Query for `GET /staff/working-now` — optionally narrow "who is on shift right
 * now" to one branch.
 *
 * **The endpoint took no query at all before Stage 6, and that was the sharpest
 * casualty of branches being separate operating units.** "Who is working now"
 * across a gym with two sites answers a question nobody asks: the receptionist
 * looking at the card is standing at ONE door and wants to know who is behind it.
 * A gym-wide answer is not a broader answer, it is a wrong one — it lists people
 * who are twenty minutes away as if they were here.
 *
 * The narrowing reads `ShiftSlot.locationId`, the branch the shift staffs — an
 * event at a place. It is emphatically NOT the roster hop: "Nino can work at
 * Saburtalo" does not put her behind that desk on a Tuesday morning, and this card
 * is about the door, not the capability.
 *
 * Omitted, every branch's shifts come back exactly as they did before, so an
 * un-updated caller sees no change. A shift with no branch (`locationId` null) is
 * absent from a filtered result and present in the unfiltered one: it is somebody
 * rostered somewhere unrecorded, and no branch may adopt it.
 */
export const workingNowQuerySchema = z.object({
  locationId: z.string().trim().min(1).optional(),
});

/** Validated `GET /staff/working-now` query — {@link workingNowQuerySchema}. */
export type WorkingNowQuery = z.infer<typeof workingNowQuerySchema>;

/**
 * One staff member on shift right now, as the on-shift card renders it.
 * A denormalised {@link ShiftSlotRow} + the staff member's display name and role,
 * so the card needs no second lookup. `staffId` is the membership id.
 *
 * The three branch fields mean exactly what they mean on {@link ShiftSlotRow} —
 * including `unresolvedLocation`, which stays a queue item rather than a branch
 * even here, where the temptation to print it beside a name is strongest.
 */
export interface WorkingNowRow {
  staffId: string;
  name: string;
  role: StaffRole;
  startTime: string;
  endTime: string;
  /** The branch this shift staffs, or `null` when it is unattributed. */
  locationId: string | null;
  /** That branch's display name, resolved through the relation. */
  locationName: string | null;
  /** A surviving free-text label that matched no branch — see {@link ShiftSlotRow}. */
  unresolvedLocation: string | null;
}

/**
 * Successful `GET /staff/working-now` response — every staff member whose weekly
 * schedule places them on shift at this moment, in the gym's own time zone,
 * ordered by start time. Narrowed to one branch when the query carried a
 * `locationId`.
 */
export interface WorkingNowResponse {
  shifts: WorkingNowRow[];
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

// ---------------------------------------------------------------------------
// Specialty catalogue
// ---------------------------------------------------------------------------

/** Body for `POST /staff/specialty-tags` — add a specialty to the gym catalogue. */
export const createSpecialtyTagSchema = z.object({
  name: z.string().trim().min(1, 'A specialty name is required').max(120),
});

/** Validated `POST /staff/specialty-tags` body — {@link createSpecialtyTagSchema}. */
export type CreateSpecialtyTagInput = z.infer<typeof createSpecialtyTagSchema>;

/** One specialty tag in the gym's catalogue — the pickable vocabulary. */
export interface SpecialtyTagRow {
  id: string;
  name: string;
}

/** Successful `GET /staff/specialty-tags` response — the gym's specialty catalogue. */
export interface ListSpecialtyTagsResponse {
  tags: SpecialtyTagRow[];
}

// ---------------------------------------------------------------------------
// Directory staff (create / edit)
// ---------------------------------------------------------------------------

/**
 * An optional email field: absent, an empty string, or a valid address. The Add
 * Staff form leaves email blank for a walk-in trainer, so `''` must validate.
 */
const optionalEmailSchema = z
  .union([
    z.literal(''),
    z.string().trim().toLowerCase().email('A valid email is required').max(200),
  ])
  .optional();

/** The status a directory staff member may be created/saved with (never INVITED). */
export const directoryStaffStatusSchema = z.enum(['ACTIVE', 'SUSPENDED']);

/**
 * Body for `POST /staff` — add a staff member straight to the directory. Creates
 * a login-less record: no invitation email is sent and no password is set. Only
 * `firstName` and `role` are required, so the front desk can capture as little as
 * a name and a role; everything else is optional. `workingHours` reuses the
 * weekly {@link shiftSlotInputSchema}; `assignedLocationIds` are gym `Location`
 * ids, persisted since Stage 6 as `LocationStaff` rows — the branches this person
 * can be rostered at.
 *
 * An empty `assignedLocationIds` is accepted and means "we do not know where this
 * person works": they appear on the gym-wide roster and under no branch filter.
 * Requiring one was considered and refused for the reason the front-desk flows keep
 * winning — this form exists so a walk-in trainer can be captured with a name and a
 * role, and a mandatory branch turns "I'll fill that in later" into "I can't add
 * them at all".
 */
export const createStaffSchema = z.object({
  firstName: z.string().trim().min(1, 'A first name is required').max(120),
  lastName: z.string().trim().max(120).default(''),
  role: staffRoleSchema,
  status: directoryStaffStatusSchema.default('ACTIVE'),
  email: optionalEmailSchema,
  phone: z.string().trim().max(40).optional(),
  assignedLocationIds: z.array(z.string().trim().min(1)).max(50).default([]),
  workingHours: z.array(shiftSlotInputSchema).max(50).default([]),
});

/** Validated `POST /staff` body — {@link createStaffSchema}. */
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

/**
 * Body for `PATCH /staff/:memberId/profile` — edit a directory staff member's
 * details and weekly schedule. Every field is optional (a partial update); an
 * omitted field is left unchanged, while a sent `workingHours` /
 * `assignedLocationIds` replaces the existing set wholesale (set-based, matching
 * the schedule editor).
 */
export const updateStaffProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  status: directoryStaffStatusSchema.optional(),
  email: optionalEmailSchema,
  phone: z.string().trim().max(40).optional(),
  assignedLocationIds: z.array(z.string().trim().min(1)).max(50).optional(),
  workingHours: z.array(shiftSlotInputSchema).max(50).optional(),
});

/** Validated `PATCH /staff/:memberId/profile` body — {@link updateStaffProfileSchema}. */
export type UpdateStaffProfileInput = z.infer<typeof updateStaffProfileSchema>;
