'use server';

import { getTranslations } from 'next-intl/server';
import {
  Permission,
  createServiceSessionSchema,
  roleHasPermission,
  type CreateServiceSessionInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  bookServiceSessionForMember,
  cancelPtSession,
  completePtSession,
  createServiceSession,
  fetchMembers,
  setServiceSessionStatus,
} from '@/lib/api';
import type { ActionResult } from '../actions';
import type { MemberSearchResult } from '../schedule/actions';

/** How many member matches the slot's booking search shows. */
const MEMBER_SEARCH_LIMIT = 8;

/** Re-assert `PtSessionManage` inside the action (defence in depth; the API re-checks). */
async function requireClassWrite(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.PtSessionManage);
}

type ErrorT = Awaited<ReturnType<typeof getTranslations>>;

const API_ERROR_KEYS = {
  PT_SESSION_NOT_FOUND: 'ptSessionNotFound',
  TRAINER_NOT_FOUND: 'trainerNotFound',
  CLASS_TYPE_NOT_FOUND: 'classTypeNotFound',
  SERVICE_NOT_FOUND: 'serviceNotFound',
  SESSION_NOT_FOUND: 'sessionNotFound',
  STAFF_BUSY: 'staffBusy',
  SESSION_STATUS_INVALID: 'sessionStatusInvalid',
  SESSION_TAKEN: 'sessionTaken',
  SESSION_PAST: 'sessionPast',
  MEMBER_NOT_FOUND: 'memberNotFound',
} as const;

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown, t: ErrorT): string {
  if (error instanceof ApiError) {
    const key = API_ERROR_KEYS[error.message as keyof typeof API_ERROR_KEYS];
    if (key) {
      return t(key);
    }
    return t('requestFailed', { status: error.status, message: error.message });
  }
  return error instanceof Error ? error.message : t('unexpected');
}

/**
 * Schedule a PT session. Re-validates with the same Zod schema the API uses,
 * enforces `ClassWrite`, then relies on the calling client's `router.refresh()` to
 * re-pull the calendar. Returns the new session's id.
 */
export async function cancelPtSessionAction(id: string): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.ptCalendar.errors');
  if (!(await requireClassWrite())) {
    return { ok: false, error: t('notAuthorized') };
  }
  try {
    await cancelPtSession(id);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Mark a PT session done (status `COMPLETED`). Enforces `ClassWrite`. */
export async function completePtSessionAction(id: string): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.ptCalendar.errors');
  if (!(await requireClassWrite())) {
    return { ok: false, error: t('notAuthorized') };
  }
  try {
    await completePtSession(id);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Open one slot of a service on the PT calendar (`POST /admin/service-sessions`). */
export async function createServiceSessionAction(
  input: CreateServiceSessionInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.ptCalendar.errors');
  if (!(await requireClassWrite())) {
    return { ok: false, error: t('notAuthorized') };
  }
  const parsed = createServiceSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('invalidSlotDetails') };
  }
  try {
    const session = await createServiceSession(parsed.data);
    return { ok: true, data: { id: session.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

export async function cancelServiceSessionAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.ptCalendar.errors');
  if (!(await requireClassWrite())) {
    return { ok: false, error: t('notAuthorized') };
  }
  try {
    await setServiceSessionStatus(id, 'cancel');
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

export async function completeServiceSessionAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.ptCalendar.errors');
  if (!(await requireClassWrite())) {
    return { ok: false, error: t('notAuthorized') };
  }
  try {
    await setServiceSessionStatus(id, 'complete');
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Find members to book onto an open slot (name or email). Enforces `PtSessionManage`. */
export async function searchMembersForSlotAction(
  query: string,
): Promise<ActionResult<MemberSearchResult[]>> {
  const t = await getTranslations('admin.ptCalendar.errors');
  if (!(await requireClassWrite())) {
    return { ok: false, error: t('notAuthorized') };
  }
  const search = query.trim();
  if (!search) return { ok: true, data: [] };
  try {
    const { data } = await fetchMembers({ search, limit: MEMBER_SEARCH_LIMIT });
    return {
      ok: true,
      data: data.map((member) => ({ id: member.id, name: member.name, email: member.email })),
    };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Book an open slot for a member on their behalf
 * (`POST /admin/service-sessions/:id/book`). Same outcome as the member booking
 * it in the portal: the slot is theirs and a pending invoice is raised.
 */
export async function bookServiceSessionForMemberAction(
  id: string,
  memberId: string,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.ptCalendar.errors');
  if (!(await requireClassWrite())) {
    return { ok: false, error: t('notAuthorized') };
  }
  try {
    await bookServiceSessionForMember(id, memberId);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}
