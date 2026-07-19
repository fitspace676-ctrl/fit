'use server';

import {
  Permission,
  createPtSessionSchema,
  roleHasPermission,
  type CreatePtSessionInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, cancelPtSession, completePtSession, createPtSession } from '@/lib/api';
import type { ActionResult } from '../actions';

/** Re-assert `ClassWrite` inside the action (defence in depth; the API re-checks). */
async function requireClassWrite(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.ClassWrite);
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
    return `Request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/**
 * Schedule a PT session. Re-validates with the same Zod schema the API uses,
 * enforces `ClassWrite`, then relies on the calling client's `router.refresh()` to
 * re-pull the calendar. Returns the new session's id.
 */
export async function createPtSessionAction(
  input: CreatePtSessionInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireClassWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = createPtSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid PT session details' };
  }
  try {
    const session = await createPtSession(parsed.data);
    return { ok: true, data: { id: session.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/** Cancel a PT session (status `CANCELED`). Enforces `ClassWrite`. */
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
