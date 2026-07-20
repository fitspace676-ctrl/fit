'use server';

import { getTranslations } from 'next-intl/server';
import {
  Permission,
  roleHasPermission,
  createStaffNoteSchema,
  createStaffTaskSchema,
  createTimeOffRequestSchema,
  decideTimeOffRequestSchema,
  updateStaffScheduleSchema,
  updateStaffTaskSchema,
  type CreateStaffNoteInput,
  type CreateStaffTaskInput,
  type CreateTimeOffRequestInput,
  type DecideTimeOffRequestInput,
  type ListStaffNotesResponse,
  type ListStaffTasksResponse,
  type ListTimeOffResponse,
  type StaffNoteRow,
  type StaffScheduleResponse,
  type StaffTaskRow,
  type TimeOffRequestRow,
  type TimeOffStatus,
  type UpdateStaffScheduleInput,
  type UpdateStaffTaskInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  createStaffNote,
  createStaffTask,
  createTimeOff,
  decideTimeOff,
  deleteStaffNote,
  deleteStaffTask,
  deleteTimeOff,
  fetchStaffNotes,
  fetchStaffSchedule,
  fetchStaffTasks,
  fetchStaffTimeOff,
  fetchTimeOff,
  updateStaffSchedule,
  updateStaffTask,
} from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Translator for the `admin.staff` namespace (from `getTranslations`). */
type Translator = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Re-assert the `StaffManage` capability inside the action. The `/staff` route is
 * gated by the middleware and every depth endpoint sits behind the API's
 * `StaffManage` guard, but a Server Action is its own POST endpoint — re-checking
 * here is defence in depth.
 */
async function requireStaffManage(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.StaffManage);
}

/** Map a thrown API error to a short, translated, staff-facing message. */
function toMessage(error: unknown, t: Translator): string {
  if (error instanceof ApiError) {
    if (error.message === 'STAFF_NOT_FOUND') {
      return t('errors.staffNotFound');
    }
    return t('errors.requestFailed', { status: error.status, message: error.message });
  }
  return error instanceof Error ? error.message : t('errors.unexpected');
}

/** Run `work` behind the `StaffManage` guard, folding thrown errors into a result. */
async function guarded<T>(work: (t: Translator) => Promise<T>): Promise<ActionResult<T>> {
  const t = await getTranslations('admin.staff');
  if (!(await requireStaffManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  try {
    return { ok: true, data: await work(t) };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

// ── Notes ────────────────────────────────────────────────────────────────────

export async function loadStaffNotesAction(
  staffId: string,
): Promise<ActionResult<ListStaffNotesResponse>> {
  return guarded(() => fetchStaffNotes(staffId));
}

export async function addStaffNoteAction(
  staffId: string,
  input: CreateStaffNoteInput,
): Promise<ActionResult<StaffNoteRow>> {
  const parsed = createStaffNoteSchema.safeParse(input);
  if (!parsed.success) {
    const t = await getTranslations('admin.staff');
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  return guarded(() => createStaffNote(staffId, parsed.data));
}

export async function deleteStaffNoteAction(noteId: string): Promise<ActionResult> {
  return guarded(async () => {
    await deleteStaffNote(noteId);
    return undefined;
  });
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export async function loadStaffTasksAction(
  staffId: string,
): Promise<ActionResult<ListStaffTasksResponse>> {
  return guarded(() => fetchStaffTasks(staffId));
}

export async function addStaffTaskAction(
  staffId: string,
  input: CreateStaffTaskInput,
): Promise<ActionResult<StaffTaskRow>> {
  const parsed = createStaffTaskSchema.safeParse(input);
  if (!parsed.success) {
    const t = await getTranslations('admin.staff');
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  return guarded(() => createStaffTask(staffId, parsed.data));
}

export async function updateStaffTaskAction(
  taskId: string,
  input: UpdateStaffTaskInput,
): Promise<ActionResult<StaffTaskRow>> {
  const parsed = updateStaffTaskSchema.safeParse(input);
  if (!parsed.success) {
    const t = await getTranslations('admin.staff');
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  return guarded(() => updateStaffTask(taskId, parsed.data));
}

export async function deleteStaffTaskAction(taskId: string): Promise<ActionResult> {
  return guarded(async () => {
    await deleteStaffTask(taskId);
    return undefined;
  });
}

// ── Time off ───────────────────────────────────────────────────────────────

export async function loadTimeOffAction(
  status?: TimeOffStatus,
): Promise<ActionResult<ListTimeOffResponse>> {
  return guarded(() => fetchTimeOff(status ? { status } : {}));
}

export async function loadStaffTimeOffAction(
  staffId: string,
): Promise<ActionResult<ListTimeOffResponse>> {
  return guarded(() => fetchStaffTimeOff(staffId));
}

export async function createTimeOffAction(
  staffId: string,
  input: CreateTimeOffRequestInput,
): Promise<ActionResult<TimeOffRequestRow>> {
  const parsed = createTimeOffRequestSchema.safeParse(input);
  if (!parsed.success) {
    const t = await getTranslations('admin.staff');
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  return guarded(() => createTimeOff(staffId, parsed.data));
}

export async function decideTimeOffAction(
  requestId: string,
  input: DecideTimeOffRequestInput,
): Promise<ActionResult<TimeOffRequestRow>> {
  const parsed = decideTimeOffRequestSchema.safeParse(input);
  if (!parsed.success) {
    const t = await getTranslations('admin.staff');
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  return guarded(() => decideTimeOff(requestId, parsed.data));
}

export async function deleteTimeOffAction(requestId: string): Promise<ActionResult> {
  return guarded(async () => {
    await deleteTimeOff(requestId);
    return undefined;
  });
}

// ── Weekly schedule ────────────────────────────────────────────────────────

export async function loadStaffScheduleAction(
  staffId: string,
): Promise<ActionResult<StaffScheduleResponse>> {
  return guarded(() => fetchStaffSchedule(staffId));
}

export async function updateStaffScheduleAction(
  staffId: string,
  input: UpdateStaffScheduleInput,
): Promise<ActionResult<StaffScheduleResponse>> {
  const parsed = updateStaffScheduleSchema.safeParse(input);
  if (!parsed.success) {
    const t = await getTranslations('admin.staff');
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  return guarded(() => updateStaffSchedule(staffId, parsed.data));
}
