'use server';

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

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message === 'PT_SESSION_NOT_FOUND') {
      return 'That PT session no longer exists.';
    }
    if (error.message === 'TRAINER_NOT_FOUND') {
      return 'That trainer no longer exists.';
    }
    if (error.message === 'CLASS_TYPE_NOT_FOUND') {
      return 'That workout type no longer exists.';
    }
    if (error.message === 'SERVICE_NOT_FOUND') {
      return 'That service no longer exists or is archived.';
    }
    if (error.message === 'SESSION_NOT_FOUND') {
      return 'That slot no longer exists.';
    }
    if (error.message === 'STAFF_BUSY') {
      return 'The staff member already has a session at that time.';
    }
    if (error.message === 'SESSION_STATUS_INVALID') {
      return 'That slot cannot change to this status.';
    }
    if (error.message === 'SESSION_TAKEN') {
      return 'That slot has just been booked by someone else.';
    }
    if (error.message === 'SESSION_PAST') {
      return 'That slot has already started.';
    }
    if (error.message === 'MEMBER_NOT_FOUND') {
      return 'That member no longer exists.';
    }
    return `Request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/**
 * Schedule a PT session. Re-validates with the same Zod schema the API uses,
 * enforces `ClassWrite`, then relies on the calling client's `router.refresh()` to
 * re-pull the calendar. Returns the new session's id.
 */
export async function cancelPtSessionAction(id: string): Promise<ActionResult<{ id: string }>> {
  if (!(await requireClassWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    await cancelPtSession(id);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/** Mark a PT session done (status `COMPLETED`). Enforces `ClassWrite`. */
export async function completePtSessionAction(id: string): Promise<ActionResult<{ id: string }>> {
  if (!(await requireClassWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    await completePtSession(id);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/** Open one slot of a service on the PT calendar (`POST /admin/service-sessions`). */
export async function createServiceSessionAction(
  input: CreateServiceSessionInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireClassWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = createServiceSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid slot details' };
  }
  try {
    const session = await createServiceSession(parsed.data);
    return { ok: true, data: { id: session.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function cancelServiceSessionAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireClassWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    await setServiceSessionStatus(id, 'cancel');
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function completeServiceSessionAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireClassWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    await setServiceSessionStatus(id, 'complete');
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/** Find members to book onto an open slot (name or email). Enforces `PtSessionManage`. */
export async function searchMembersForSlotAction(
  query: string,
): Promise<ActionResult<MemberSearchResult[]>> {
  if (!(await requireClassWrite())) {
    return { ok: false, error: 'Not authorized' };
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
    return { ok: false, error: toMessage(error) };
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
  if (!(await requireClassWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    await bookServiceSessionForMember(id, memberId);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
