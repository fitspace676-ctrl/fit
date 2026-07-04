'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  Permission,
  roleHasPermission,
  type AttendanceStatus,
  type CancelClassInstanceResponse,
  type GetAdminClassInstanceResponse,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  cancelScheduleInstance,
  fetchScheduleInstance,
  markAttendance,
  promoteWaitlistEntry,
} from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Re-assert a capability inside the action itself. The middleware gates the
 * `/schedule` route, but a Server Action is its own POST endpoint, so re-checking
 * here is defence in depth (the API re-checks again behind its guards).
 */
async function sessionHas(permission: Permission): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, permission);
}

type T = Awaited<ReturnType<typeof getTranslations>>;

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown, t: T): string {
  if (error instanceof ApiError) {
    if (error.message === 'CLASS_INSTANCE_NOT_FOUND') {
      return t('errors.notFound');
    }
    if (error.message === 'CLASS_NOT_CANCELABLE') {
      return t('errors.notCancelable');
    }
    if (error.message === 'CLASS_NOT_STARTED') {
      return t('errors.notStarted');
    }
    if (error.message === 'ATTENDANCE_NOT_AVAILABLE') {
      return t('errors.attendanceUnavailable');
    }
    if (error.message === 'CLASS_NOT_MODIFIABLE') {
      return t('errors.notModifiable');
    }
    if (error.message === 'BOOKING_NOT_PROMOTABLE') {
      return t('errors.notPromotable');
    }
    if (error.message === 'BOOKING_NOT_FOUND') {
      return t('errors.bookingNotFound');
    }
    if (error.message === 'BOOKING_NOT_ATTENDABLE') {
      return t('errors.bookingNotAttendable');
    }
    return t('errors.requestFailed', { status: error.status, message: error.message });
  }
  return error instanceof Error ? error.message : t('errors.unexpected');
}

/**
 * Load one occurrence's full detail (block + roster + waitlist) for the schedule
 * drawer (T3.3). Re-checks `ClassRead` — the read the calendar itself is gated on
 * — before hitting the tenant-scoped API. Returns a discriminated result so the
 * drawer can render an inline error instead of crashing.
 */
export async function loadInstanceDetailAction(
  id: string,
): Promise<ActionResult<GetAdminClassInstanceResponse>> {
  const t = await getTranslations('admin.schedule.drawer');
  if (!(await sessionHas(Permission.ClassRead))) {
    return { ok: false, error: t('errors.forbidden') };
  }
  try {
    return { ok: true, data: await fetchScheduleInstance(id) };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Cancel a scheduled occurrence from the drawer's quick actions (T3.3). Enforces
 * `ClassWrite`, then refreshes the `/schedule` cache so the week grid reflects the
 * canceled block. Returns the refreshed detail so the drawer re-renders in place.
 */
export async function cancelInstanceAction(
  id: string,
): Promise<ActionResult<CancelClassInstanceResponse>> {
  const t = await getTranslations('admin.schedule.drawer');
  if (!(await sessionHas(Permission.ClassWrite))) {
    return { ok: false, error: t('errors.forbidden') };
  }
  try {
    const data = await cancelScheduleInstance(id);
    revalidatePath('/schedule');
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Record one held seat's attendance outcome inline from the drawer roster (T3.5).
 * Enforces `ClassWrite`, marks the single booking `ATTENDED` / `NO_SHOW` via the
 * attendance endpoint (which transitions the occurrence to `COMPLETED`), then
 * re-reads the occurrence detail so the drawer re-renders from the refreshed
 * roster — the same `AdminClassInstanceDetail` shape it already renders, keeping
 * one source of truth. Also refreshes the `/schedule` cache so the week grid
 * reflects the now-completed occurrence. Returns a discriminated result so the
 * drawer can surface an inline error instead of throwing across the boundary.
 */
export async function markAttendanceAction(
  id: string,
  bookingId: string,
  status: AttendanceStatus,
): Promise<ActionResult<GetAdminClassInstanceResponse>> {
  const t = await getTranslations('admin.schedule.drawer');
  if (!(await sessionHas(Permission.ClassWrite))) {
    return { ok: false, error: t('errors.forbidden') };
  }
  try {
    await markAttendance(id, { entries: [{ bookingId, status }] });
    const data = await fetchScheduleInstance(id);
    revalidatePath('/schedule');
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Manually promote one waitlisted booking into a held seat from the drawer's
 * waitlist controls (T3.6). Enforces `ClassWrite`, then promotes the chosen entry
 * via the schedule API (which flips it `WAITLIST → BOOKED`, grows `bookedCount`,
 * charges the member a class credit best-effort, and closes the queue behind
 * them), returning the refreshed `AdminClassInstanceDetail` so the drawer
 * re-renders from the one call — the same shape it already renders. Also
 * refreshes the `/schedule` cache so the week grid's occupancy follows. Returns a
 * discriminated result so the drawer can surface an inline error instead of
 * throwing across the boundary.
 */
export async function promoteWaitlistAction(
  id: string,
  bookingId: string,
): Promise<ActionResult<GetAdminClassInstanceResponse>> {
  const t = await getTranslations('admin.schedule.drawer');
  if (!(await sessionHas(Permission.ClassWrite))) {
    return { ok: false, error: t('errors.forbidden') };
  }
  try {
    const data = await promoteWaitlistEntry(id, bookingId);
    revalidatePath('/schedule');
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}
