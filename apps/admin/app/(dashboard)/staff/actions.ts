'use server';

import { revalidatePath } from 'next/cache';
import {
  Permission,
  inviteStaffSchema,
  roleHasPermission,
  updateStaffRoleSchema,
  type InviteStaffInput,
  type StaffMember,
  type StaffRole,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, inviteStaff, removeStaff, revokeStaffInvite, updateStaffRole } from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Re-assert the `StaffManage` capability inside the action itself. The middleware
 * already gates the `/staff` route (OWNER+), but a Server Action is a POST
 * endpoint in its own right, so re-checking here keeps it safe even if the
 * matcher ever changes — defence in depth (the API re-checks behind its guards).
 */
async function requireStaffManage(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.StaffManage);
}

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message === 'ALREADY_STAFF') {
      return 'That person is already a staff member of your gym.';
    }
    if (error.message === 'LAST_OWNER') {
      return 'You can’t change or remove the gym’s only owner — add another owner first.';
    }
    if (error.message === 'STAFF_NOT_FOUND') {
      return 'That staff member no longer exists.';
    }
    if (error.message === 'INVITE_NOT_FOUND') {
      return 'That invitation no longer exists.';
    }
    return `Request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/**
 * Invite someone to the gym's staff. Re-validates the body with the same Zod
 * schema the API uses, enforces `StaffManage`, then refreshes the staff page so
 * the new pending invite appears. Returns the new invite's id.
 */
export async function inviteStaffAction(
  input: InviteStaffInput,
): Promise<ActionResult<{ inviteId: string }>> {
  if (!(await requireStaffManage())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = inviteStaffSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid invitation details' };
  }
  try {
    const { inviteId } = await inviteStaff(parsed.data);
    revalidatePath('/staff');
    return { ok: true, data: { inviteId } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Revoke a pending invitation. Enforces `StaffManage` and refreshes the staff
 * page so the invite drops off the list.
 */
export async function revokeInviteAction(inviteId: string): Promise<ActionResult> {
  if (!(await requireStaffManage())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    await revokeStaffInvite(inviteId);
    revalidatePath('/staff');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Change a staff member's role. Re-validates the body, enforces `StaffManage`,
 * and refreshes the staff page. A `403 LAST_OWNER` from the API surfaces as a
 * clear message rather than a generic failure.
 */
export async function updateStaffRoleAction(
  memberId: string,
  role: StaffRole,
): Promise<ActionResult<{ member: StaffMember }>> {
  if (!(await requireStaffManage())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = updateStaffRoleSchema.safeParse({ role });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid role' };
  }
  try {
    const member = await updateStaffRole(memberId, parsed.data);
    revalidatePath('/staff');
    return { ok: true, data: { member } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Remove a staff member, revoking their sessions. Enforces `StaffManage` and
 * refreshes the staff page. A `403 LAST_OWNER` surfaces as a clear message.
 */
export async function removeStaffAction(memberId: string): Promise<ActionResult> {
  if (!(await requireStaffManage())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    await removeStaff(memberId);
    revalidatePath('/staff');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
