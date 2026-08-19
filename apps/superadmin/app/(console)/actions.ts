'use server';

import { revalidatePath } from 'next/cache';
import { createAdminGymSchema, type CreateAdminGymInput, type GymStatus } from '@fit/types';
import { isSuperAdmin } from '@/lib/auth-session';
import { getServerSession } from '@/lib/session';
import { ApiError, createGym, impersonateGym, setGymStatus } from '@/lib/api';
import { tenantAdminUrl } from '@/lib/tenant-url';

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

/**
 * Suspend or reactivate a gym, then revalidate the roster so the table reflects
 * it. Suspension is enforced at login and refresh API-side, so a suspended gym's
 * staff and members are locked out of NEW sessions — existing access tokens run
 * out their remaining minutes rather than dying on the spot.
 */
export async function setGymStatusAction(
  id: string,
  status: GymStatus,
): Promise<ActionResult<{ id: string; status: GymStatus }>> {
  if (!(await requireOperator())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const updated = await setGymStatus(id, status);
    // Both screens show the status, and either can be the one the operator is
    // looking at when it changes.
    revalidatePath('/');
    revalidatePath(`/gyms/${id}`);
    return { ok: true, data: updated };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Start an impersonation: mint a handoff code and return the one URL that
 * redeems it — `https://<slug>.<root>/admin/impersonation/start?code=…`.
 *
 * The URL is built here, on the server, because the slug→host mapping is
 * configuration (`NEXT_PUBLIC_ROOT_DOMAIN`) and the code is a credential; the
 * client's only job is to open what it is handed. When no root domain is
 * configured there is no tenant host to send anyone to, and saying so is better
 * than minting a code that can only expire unused.
 */
export async function startImpersonationAction(
  gymId: string,
  subdomainSlug: string,
): Promise<ActionResult<{ url: string }>> {
  if (!(await requireOperator())) {
    return { ok: false, error: 'Not authorized' };
  }

  const adminUrl = tenantAdminUrl(subdomainSlug);
  if (!adminUrl) {
    return { ok: false, error: 'No root domain configured — set NEXT_PUBLIC_ROOT_DOMAIN.' };
  }

  try {
    const { handoffCode } = await impersonateGym(gymId);
    return {
      ok: true,
      data: { url: `${adminUrl}/impersonation/start?code=${encodeURIComponent(handoffCode)}` },
    };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Provision a gym on an owner's behalf.
 *
 * The body is validated HERE with the API's own schema before the request is
 * made, so a mistyped subdomain is answered in the form rather than by a round
 * trip — and validated again by the API, which is the one that decides. The
 * reserved-label and DNS-shape rules live in `gymSlugSchema`, so the console
 * cannot drift from what the platform will actually accept.
 *
 * Returns the new gym's id rather than redirecting: the caller is a client
 * component that already knows how to navigate, and a `redirect()` thrown
 * through a Server Action would lose the form's own error handling.
 */
export async function createGymAction(
  input: CreateAdminGymInput,
): Promise<ActionResult<{ gymId: string }>> {
  if (!(await requireOperator())) {
    return { ok: false, error: 'Not authorized' };
  }

  const parsed = createAdminGymSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first ? `${first.path.join('.')}: ${first.message}` : 'Invalid details',
    };
  }

  try {
    const { gymId } = await createGym(parsed.data);
    revalidatePath('/');
    return { ok: true, data: { gymId } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
