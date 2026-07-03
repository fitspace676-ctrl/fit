'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
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

/** Translator for the `admin.staff` namespace (from `getTranslations`). */
type Translator = Awaited<ReturnType<typeof getTranslations>>;

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

/** Map a thrown API error to a short, translated, staff-facing message. */
function toMessage(error: unknown, t: Translator): string {
  if (error instanceof ApiError) {
    if (error.message === 'ALREADY_STAFF') {
      return t('errors.alreadyStaff');
    }
    if (error.message === 'LAST_OWNER') {
      return t('errors.lastOwner');
    }
    if (error.message === 'STAFF_NOT_FOUND') {
      return t('errors.staffNotFound');
    }
    if (error.message === 'INVITE_NOT_FOUND') {
      return t('errors.inviteNotFound');
    }
    return t('errors.requestFailed', { status: error.status, message: error.message });
  }
  return error instanceof Error ? error.message : t('errors.unexpected');
}

/**
 * Invite someone to the gym's staff. Re-validates the body with the same Zod
 * schema the API uses, enforces `StaffManage`, then refreshes the staff page so
 * the new pending invite appears. Returns the new invite's id.
 */
export async function inviteStaffAction(
  input: InviteStaffInput,
): Promise<ActionResult<{ inviteId: string }>> {
  const t = await getTranslations('admin.staff');
  if (!(await requireStaffManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = inviteStaffSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const { inviteId } = await inviteStaff(parsed.data);
    revalidatePath('/staff');
    return { ok: true, data: { inviteId } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Revoke a pending invitation. Enforces `StaffManage` and refreshes the staff
 * page so the invite drops off the list.
 */
export async function revokeInviteAction(inviteId: string): Promise<ActionResult> {
  const t = await getTranslations('admin.staff');
  if (!(await requireStaffManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  try {
    await revokeStaffInvite(inviteId);
    revalidatePath('/staff');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
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
  const t = await getTranslations('admin.staff');
  if (!(await requireStaffManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = updateStaffRoleSchema.safeParse({ role });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidRole') };
  }
  try {
    const member = await updateStaffRole(memberId, parsed.data);
    revalidatePath('/staff');
    return { ok: true, data: { member } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Remove a staff member, revoking their sessions. Enforces `StaffManage` and
 * refreshes the staff page. A `403 LAST_OWNER` surfaces as a clear message.
 */
export async function removeStaffAction(memberId: string): Promise<ActionResult> {
  const t = await getTranslations('admin.staff');
  if (!(await requireStaffManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  try {
    await removeStaff(memberId);
    revalidatePath('/staff');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}
