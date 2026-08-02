import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { GymMemberStatus, Prisma, Role } from '@fit/db';
import {
  gymSettingsStoredSchema,
  staffRolePermissionMatrix,
  type CreateStaffNoteInput,
  type CreateStaffTaskInput,
  type CreateTimeOffRequestInput,
  type DecideTimeOffRequestInput,
  type ListStaffNotesResponse,
  type ListStaffRolesResponse,
  type ListStaffTasksResponse,
  type ListTimeOffQuery,
  type ListTimeOffResponse,
  type ShiftSlotRow,
  type StaffNoteRow,
  type StaffRole,
  type StaffScheduleResponse,
  type StaffTaskRow,
  type TimeOffRequestRow,
  type UpdateStaffScheduleInput,
  type UpdateStaffTaskInput,
  type WorkingNowResponse,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** The gym-scoped roles that count as staff — every role except a plain `MEMBER`. */
const STAFF_ROLES: Role[] = [Role.OWNER, Role.MANAGER, Role.RECEPTIONIST, Role.TRAINER];

/** `Intl`'s `weekday: 'short'` names mapped to the app's 0 = Monday … 6 = Sunday convention. */
const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/**
 * The wall-clock weekday and time at a gym, as its schedule means them.
 *
 * `ShiftSlot` stores a weekday plus `"HH:MM"` strings with no zone attached, so
 * "is this shift running?" can only be answered against the gym's own clock —
 * reading the host's (`Date#getDay()`, `getHours()`) makes a UTC server serving
 * an `Asia/Tbilisi` gym four hours wrong, and a whole day wrong after 20:00
 * local. Both fields therefore come from a single zoned `formatToParts` call.
 *
 * `hourCycle: 'h23'` rather than `hour12: false`: the latter leaves the cycle to
 * the locale, and an `h24` resolution renders midnight as `"24:00"`, which sorts
 * after every `endTime` and would empty the roster for an hour each night.
 *
 * `instant` is injectable so tests can pin a moment without fake timers.
 *
 * @throws {Error} if `Intl` resolves a weekday name outside {@link WEEKDAY_INDEX}.
 * @throws {RangeError} from `Intl.DateTimeFormat` if `timeZone` is not a valid IANA
 * zone. {@link isValidTimeZone} (`packages/types/src/gym-settings.ts`) relies on this
 * exact behaviour, and stored settings are validated against it before they ever
 * reach here, so a gym whose settings parsed successfully cannot hit this path.
 */
export function gymLocalNow(
  timeZone: string,
  instant: Date = new Date(),
): { dayOfWeek: number; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  // Falls back to '' for a part `Intl` didn't return, rather than throwing — unlike
  // the weekday check below. A missing hour/minute would make `time === ":"`, which
  // (as the top of every digit's sort order) matches no `endTime` and empties the
  // roster: it fails *safe*. An unrecognised weekday would instead query the wrong
  // day's shifts — it fails *wrong* — so only that case is worth throwing over.
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';

  const weekday = part('weekday');
  const dayOfWeek = WEEKDAY_INDEX[weekday];
  if (dayOfWeek === undefined) {
    throw new Error(`Unrecognised weekday "${weekday}" for time zone ${timeZone}`);
  }

  return { dayOfWeek, time: `${part('hour')}:${part('minute')}` };
}

const NOTE_SELECT = {
  id: true,
  staffId: true,
  authorName: true,
  body: true,
  createdAt: true,
} satisfies Prisma.StaffNoteSelect;
type NoteRecord = Prisma.StaffNoteGetPayload<{ select: typeof NOTE_SELECT }>;

const TASK_SELECT = {
  id: true,
  staffId: true,
  title: true,
  description: true,
  dueDate: true,
  completed: true,
  completedAt: true,
  assignedByName: true,
  createdAt: true,
} satisfies Prisma.StaffTaskSelect;
type TaskRecord = Prisma.StaffTaskGetPayload<{ select: typeof TASK_SELECT }>;

const TIME_OFF_SELECT = {
  id: true,
  staffId: true,
  startDate: true,
  endDate: true,
  reason: true,
  status: true,
  decidedByName: true,
  decidedAt: true,
  createdAt: true,
  staff: { select: { user: { select: { name: true, email: true } } } },
} satisfies Prisma.TimeOffRequestSelect;
type TimeOffRecord = Prisma.TimeOffRequestGetPayload<{ select: typeof TIME_OFF_SELECT }>;

const SHIFT_SELECT = {
  id: true,
  staffId: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  location: true,
} satisfies Prisma.ShiftSlotSelect;
type ShiftRecord = Prisma.ShiftSlotGetPayload<{ select: typeof SHIFT_SELECT }>;

/**
 * Staff-console "depth" module (T12.14): the per-staff Notes, Tasks, Time-off,
 * and Weekly-schedule tabs, the gym-wide time-off approval queue,
 * and the read-only Roles & Permissions matrix.
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every query is
 * auto-constrained to (and, on create, stamped with) the caller's gym by the
 * Prisma tenant extension, so a handler never passes or trusts a `gymId` — and a
 * cross-tenant id simply never resolves. A staff member is addressed by their
 * {@link GymMember} membership id (`staffId`), the same handle the roster uses;
 * {@link requireStaff} both 404s a bad id and rejects a plain `MEMBER`.
 *
 * "Who did this" attributions (`authorName`, `assignedByName`, `decidedByName`)
 * are resolved server-side from the request's session and snapshotted onto the
 * row, so they survive the actor later renaming or leaving — never trusted from
 * the client body.
 */
@Injectable()
export class StaffDepthService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  // -- Roles matrix ---------------------------------------------------------

  /**
   * The read-only Roles & Permissions matrix (`GET /staff/roles`) — each staff
   * role paired with the permissions it grants. Derived from the single-source
   * `ROLE_PERMISSIONS` map in `@fit/types` so the console renders exactly what
   * the API authorizes on; no gym data is read.
   */
  listRoles(): ListStaffRolesResponse {
    return { roles: staffRolePermissionMatrix() };
  }

  // -- Notes ----------------------------------------------------------------

  /** A staff member's internal notes, newest first (`GET /staff/:staffId/notes`). */
  async listNotes(staffId: string): Promise<ListStaffNotesResponse> {
    await this.requireStaff(staffId);
    const notes = await this.prisma.client.staffNote.findMany({
      where: { staffId },
      select: NOTE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return { notes: notes.map((row) => this.toNoteRow(row)) };
  }

  /** Log an internal note about a staff member (`POST /staff/:staffId/notes`). */
  async addNote(staffId: string, input: CreateStaffNoteInput): Promise<StaffNoteRow> {
    await this.requireStaff(staffId);
    const author = await this.resolveActor();
    const note = await this.prisma.client.staffNote.create({
      data: {
        gymId: this.tenant.gymId,
        staffId,
        authorId: author.id,
        authorName: author.name,
        body: input.body,
      },
      select: NOTE_SELECT,
    });
    return this.toNoteRow(note);
  }

  /** Delete a staff note (`DELETE /staff/notes/:noteId`). 404s an unknown id. */
  async deleteNote(noteId: string): Promise<void> {
    const deleted = await this.prisma.client.staffNote.deleteMany({ where: { id: noteId } });
    if (deleted.count === 0) {
      throw new NotFoundException({ message: 'Note not found', code: 'NOTE_NOT_FOUND' });
    }
  }

  // -- Tasks ----------------------------------------------------------------

  /** A staff member's assigned tasks (`GET /staff/:staffId/tasks`). */
  async listTasks(staffId: string): Promise<ListStaffTasksResponse> {
    await this.requireStaff(staffId);
    const tasks = await this.prisma.client.staffTask.findMany({
      where: { staffId },
      select: TASK_SELECT,
      orderBy: [{ completed: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });
    return { tasks: tasks.map((row) => this.toTaskRow(row)) };
  }

  /** Assign a task to a staff member (`POST /staff/:staffId/tasks`). */
  async addTask(staffId: string, input: CreateStaffTaskInput): Promise<StaffTaskRow> {
    await this.requireStaff(staffId);
    const assigner = await this.resolveActor();
    const task = await this.prisma.client.staffTask.create({
      data: {
        gymId: this.tenant.gymId,
        staffId,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        assignedById: assigner.id,
        assignedByName: assigner.name,
      },
      select: TASK_SELECT,
    });
    return this.toTaskRow(task);
  }

  /**
   * Edit a task or toggle its completion (`PATCH /staff/tasks/:taskId`). Toggling
   * `completed` stamps (or clears) `completedAt`. 404s an unknown id.
   */
  async updateTask(taskId: string, input: UpdateStaffTaskInput): Promise<StaffTaskRow> {
    await this.requireTask(taskId);

    const data: Prisma.StaffTaskUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    if (input.completed !== undefined) {
      data.completed = input.completed;
      data.completedAt = input.completed ? new Date() : null;
    }

    await this.prisma.client.staffTask.update({ where: { id: taskId }, data });
    const updated = await this.prisma.client.staffTask.findFirst({
      where: { id: taskId },
      select: TASK_SELECT,
    });
    // Just updated under the scoped client, so it must still resolve.
    if (!updated) {
      throw new NotFoundException({ message: 'Task not found', code: 'TASK_NOT_FOUND' });
    }
    return this.toTaskRow(updated);
  }

  /** Delete a task (`DELETE /staff/tasks/:taskId`). 404s an unknown id. */
  async deleteTask(taskId: string): Promise<void> {
    const deleted = await this.prisma.client.staffTask.deleteMany({ where: { id: taskId } });
    if (deleted.count === 0) {
      throw new NotFoundException({ message: 'Task not found', code: 'TASK_NOT_FOUND' });
    }
  }

  // -- Time off -------------------------------------------------------------

  /**
   * The gym-wide time-off queue (`GET /staff/time-off`), optionally filtered by
   * `status` / `staffId` — the manager's approval inbox. Pending first, then by
   * start date.
   */
  async listTimeOff(query: ListTimeOffQuery): Promise<ListTimeOffResponse> {
    const requests = await this.prisma.client.timeOffRequest.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.staffId ? { staffId: query.staffId } : {}),
      },
      select: TIME_OFF_SELECT,
      orderBy: [{ status: 'asc' }, { startDate: 'asc' }],
    });
    return { requests: requests.map((row) => this.toTimeOffRow(row)) };
  }

  /** A single staff member's time-off requests (`GET /staff/:staffId/time-off`). */
  async listStaffTimeOff(staffId: string): Promise<ListTimeOffResponse> {
    await this.requireStaff(staffId);
    const requests = await this.prisma.client.timeOffRequest.findMany({
      where: { staffId },
      select: TIME_OFF_SELECT,
      orderBy: { startDate: 'desc' },
    });
    return { requests: requests.map((row) => this.toTimeOffRow(row)) };
  }

  /** File a time-off request for a staff member (`POST /staff/:staffId/time-off`). */
  async createTimeOff(
    staffId: string,
    input: CreateTimeOffRequestInput,
  ): Promise<TimeOffRequestRow> {
    await this.requireStaff(staffId);
    const request = await this.prisma.client.timeOffRequest.create({
      data: {
        gymId: this.tenant.gymId,
        staffId,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        reason: input.reason ?? '',
      },
      select: TIME_OFF_SELECT,
    });
    return this.toTimeOffRow(request);
  }

  /**
   * Approve or deny a pending request (`PATCH /staff/time-off/:requestId/decision`).
   * Only a `pending` request can be decided (`409 ALREADY_DECIDED` otherwise);
   * the transition snapshots the deciding user + timestamp. 404s an unknown id.
   */
  async decideTimeOff(
    requestId: string,
    input: DecideTimeOffRequestInput,
  ): Promise<TimeOffRequestRow> {
    const existing = await this.prisma.client.timeOffRequest.findFirst({
      where: { id: requestId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException({
        message: 'Time-off request not found',
        code: 'TIME_OFF_NOT_FOUND',
      });
    }
    if (existing.status !== 'pending') {
      throw new ConflictException({
        message: 'This request has already been decided',
        code: 'ALREADY_DECIDED',
      });
    }

    const decider = await this.resolveActor();
    await this.prisma.client.timeOffRequest.update({
      where: { id: requestId },
      data: {
        status: input.decision === 'approve' ? 'approved' : 'denied',
        decidedById: decider.id,
        decidedByName: decider.name,
        decidedAt: new Date(),
      },
    });
    const updated = await this.prisma.client.timeOffRequest.findFirst({
      where: { id: requestId },
      select: TIME_OFF_SELECT,
    });
    if (!updated) {
      throw new NotFoundException({
        message: 'Time-off request not found',
        code: 'TIME_OFF_NOT_FOUND',
      });
    }
    return this.toTimeOffRow(updated);
  }

  /** Withdraw a time-off request (`DELETE /staff/time-off/:requestId`). 404s a bad id. */
  async deleteTimeOff(requestId: string): Promise<void> {
    const deleted = await this.prisma.client.timeOffRequest.deleteMany({
      where: { id: requestId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException({
        message: 'Time-off request not found',
        code: 'TIME_OFF_NOT_FOUND',
      });
    }
  }

  // -- Weekly schedule ------------------------------------------------------

  /** A staff member's weekly schedule (`GET /staff/:staffId/schedule`). */
  async getSchedule(staffId: string): Promise<StaffScheduleResponse> {
    await this.requireStaff(staffId);
    const shifts = await this.prisma.client.shiftSlot.findMany({
      where: { staffId },
      select: SHIFT_SELECT,
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    return { shifts: shifts.map((row) => this.toShiftRow(row)) };
  }

  /**
   * Replace a staff member's whole weekly schedule (`PUT /staff/:staffId/schedule`).
   * A set-based editor: the sent list becomes the schedule, so the write clears
   * the old shifts and re-inserts the new ones in one transaction (an empty list
   * clears the schedule). Returns the fresh schedule.
   */
  async updateSchedule(
    staffId: string,
    input: UpdateStaffScheduleInput,
  ): Promise<StaffScheduleResponse> {
    await this.requireStaff(staffId);
    const gymId = this.tenant.gymId;

    await this.prisma.client.$transaction(async (tx) => {
      await tx.shiftSlot.deleteMany({ where: { staffId } });
      if (input.shifts.length > 0) {
        await tx.shiftSlot.createMany({
          data: input.shifts.map((shift) => ({
            gymId,
            staffId,
            dayOfWeek: shift.dayOfWeek,
            startTime: shift.startTime,
            endTime: shift.endTime,
            location: shift.location ?? null,
          })),
        });
      }
    });

    return this.getSchedule(staffId);
  }

  /**
   * Everyone on shift **right now** (`GET /staff/working-now`) — the roster
   * behind the on-shift card. Reads the gym's weekly {@link ShiftSlot} schedule
   * for the current weekday and keeps only the slots whose window contains the
   * current time, joined to each staff member's display name and role so the
   * card renders without a second lookup. Only `ACTIVE` staff memberships are
   * returned, ordered by start time. Tenant-scoped, so it only ever sees the
   * caller's gym.
   *
   * Both the weekday and the time come from the gym's configured zone via
   * {@link gymLocalNow} — a schedule written as "Wednesday 09:00–17:00" means
   * the gym's Wednesday, not the host's. `startTime` is inclusive and `endTime`
   * exclusive, so back-to-back shifts hand over with neither gap nor overlap —
   * within a single day. `endTime` is capped at `23:59`, so a shift that runs
   * past midnight has to be entered as two rows, which leaves a one-minute seam
   * at 23:59 where the card reads empty.
   */
  async getWorkingNow(): Promise<WorkingNowResponse> {
    const gym = await this.prisma.client.gym.findUnique({
      where: { id: this.tenant.gymId },
      select: { settings: true },
    });
    const { locale } = gymSettingsStoredSchema.parse(gym?.settings ?? {});
    const { dayOfWeek, time } = gymLocalNow(locale.timezone);

    const shifts = await this.prisma.client.shiftSlot.findMany({
      where: {
        dayOfWeek,
        startTime: { lte: time },
        endTime: { gt: time },
        staff: { role: { in: STAFF_ROLES }, status: GymMemberStatus.ACTIVE },
      },
      select: {
        staffId: true,
        startTime: true,
        endTime: true,
        location: true,
        staff: { select: { role: true, user: { select: { name: true, email: true } } } },
      },
      orderBy: [{ startTime: 'asc' }],
    });
    return {
      shifts: shifts.map((row) => ({
        staffId: row.staffId,
        name: row.staff.user.name ?? row.staff.user.email,
        role: row.staff.role as StaffRole,
        startTime: row.startTime,
        endTime: row.endTime,
        location: row.location,
      })),
    };
  }

  // -- Helpers --------------------------------------------------------------

  /**
   * Resolve a staff-role membership in the caller's gym or throw
   * `404 STAFF_NOT_FOUND`. The scoped `where` constrains `gymId`, so a
   * cross-tenant id never matches, and a plain `MEMBER` is rejected — these
   * records only ever hang off staff.
   */
  private async requireStaff(staffId: string): Promise<void> {
    const member = await this.prisma.client.gymMember.findFirst({
      where: { id: staffId, role: { in: STAFF_ROLES } },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException({ message: 'Staff member not found', code: 'STAFF_NOT_FOUND' });
    }
  }

  /** Resolve a task in the caller's gym or throw `404 TASK_NOT_FOUND`. */
  private async requireTask(taskId: string): Promise<void> {
    const task = await this.prisma.client.staffTask.findFirst({
      where: { id: taskId },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException({ message: 'Task not found', code: 'TASK_NOT_FOUND' });
    }
  }

  /**
   * The acting user's id + display name, read from the request session (never the
   * body). Falls back to `'Staff'` when the name/email can't be resolved, mirroring
   * the member-notes attribution.
   */
  private async resolveActor(): Promise<{ id: string | null; name: string }> {
    const id = this.tenant.userId ?? null;
    if (!id) {
      return { id: null, name: 'Staff' };
    }
    const user = await this.prisma.client.user.findUnique({
      where: { id },
      select: { name: true, email: true },
    });
    return { id, name: user?.name ?? user?.email ?? 'Staff' };
  }

  private toNoteRow(row: NoteRecord): StaffNoteRow {
    return {
      id: row.id,
      staffId: row.staffId,
      author: row.authorName,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toTaskRow(row: TaskRecord): StaffTaskRow {
    return {
      id: row.id,
      staffId: row.staffId,
      title: row.title,
      description: row.description,
      dueDate: row.dueDate ? row.dueDate.toISOString() : null,
      completed: row.completed,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      assignedBy: row.assignedByName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toTimeOffRow(row: TimeOffRecord): TimeOffRequestRow {
    return {
      id: row.id,
      staffId: row.staffId,
      staffName: row.staff.user.name ?? row.staff.user.email,
      startDate: row.startDate.toISOString(),
      endDate: row.endDate.toISOString(),
      reason: row.reason,
      status: row.status,
      decidedBy: row.decidedByName,
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toShiftRow(row: ShiftRecord): ShiftSlotRow {
    return {
      id: row.id,
      staffId: row.staffId,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
      location: row.location,
    };
  }
}
