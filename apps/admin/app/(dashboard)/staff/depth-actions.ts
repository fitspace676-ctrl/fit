'use server';

import { getTranslations } from 'next-intl/server';
import { Permission, roleHasPermission, type StaffScheduleResponse } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchStaffSchedule } from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Translator for the `admin.staff` namespace (from `getTranslations`). */
type Translator = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Re-assert the `StaffScheduleRead` capability inside the action. The `/staff` route is
 * gated by the middleware and the schedule endpoint sits behind the API's
 * `StaffScheduleRead` guard, but a Server Action is its own POST endpoint — re-checking
 * here is defence in depth.
 */
async function requireStaffManage(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.StaffScheduleRead);
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

/** Run `work` behind the `StaffScheduleRead` guard, folding thrown errors into a result. */
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

// ── Weekly schedule ────────────────────────────────────────────────────────

/**
 * A staff member's weekly shifts, read by the profile drawer.
 *
 * The sole survivor of this file's original fourteen actions. The notes, tasks
 * and time-off panels they served were removed along with their settings
 * toggles; the API endpoints behind them are untouched, so re-adding an action
 * here is a few lines whenever a panel comes back.
 */
export async function loadStaffScheduleAction(
  staffId: string,
): Promise<ActionResult<StaffScheduleResponse>> {
  return guarded(() => fetchStaffSchedule(staffId));
}
