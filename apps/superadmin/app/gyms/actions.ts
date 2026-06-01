'use server';

import { revalidatePath } from 'next/cache';
import type { GymStatus } from '@fit/types';
import { isSuperAdmin } from '@/lib/auth-session';
import { getServerSession } from '@/lib/session';
import { ApiError, impersonateGym, setGymStatus } from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Re-assert SUPER_ADMIN inside the action itself. The middleware already gates
 * every route, but a Server Action is a POST endpoint in its own right, so
 * re-checking here keeps it safe even if the matcher ever changes — defence in
 * depth, not a substitute for the gate.
 */
async function requireOperator(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && isSuperAdmin(session.role);
}

/** Map a thrown API error to a short, operator-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `Request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/** Suspend or reactivate a gym, then revalidate the roster so the table reflects it. */
export async function setGymStatusAction(
  id: string,
  status: GymStatus,
): Promise<ActionResult<{ id: string; status: GymStatus }>> {
  if (!(await requireOperator())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const updated = await setGymStatus(id, status);
    revalidatePath('/gyms');
    return { ok: true, data: updated };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/** Mint an audited, gym-scoped owner token and hand it back to the operator. */
export async function impersonateGymAction(
  id: string,
): Promise<ActionResult<{ accessToken: string }>> {
  if (!(await requireOperator())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const { accessToken } = await impersonateGym(id);
    return { ok: true, data: { accessToken } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
