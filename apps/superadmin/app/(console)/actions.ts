'use server';

import { revalidatePath } from 'next/cache';
import {
  createAdminGymRequestSchema,
  rejectAdminGymRequestSchema,
  type AdminGymRequest,
  type ApproveAdminGymRequestResponse,
  type CreateAdminGymRequestInput,
  type GymStatus,
} from '@fit/types';
import { requireOperator } from '@/lib/operator';
import {
  ApiError,
  createGymRequest,
  regenerateGymRequestLink,
  approveGymRequest,
  rejectGymRequest,
  impersonateGym,
  setGymStatus,
} from '@/lib/api';
import { tenantAdminUrl } from '@/lib/tenant-url';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

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
    return { ok: false, error: 'No root domain configured. Set NEXT_PUBLIC_ROOT_DOMAIN.' };
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

function refreshRequests(id: string) {
  revalidatePath('/');
  revalidatePath('/requests');
  revalidatePath(`/requests/${id}`);
  revalidatePath('/', 'layout');
}

export async function createGymRequestAction(
  input: CreateAdminGymRequestInput,
): Promise<ActionResult<AdminGymRequest>> {
  if (!(await requireOperator())) return { ok: false, error: 'Not authorized' };
  const parsed = createAdminGymRequestSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid details' };
  try {
    const request = await createGymRequest(parsed.data);
    refreshRequests(request.id);
    return { ok: true, data: request };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function regenerateGymRequestLinkAction(
  id: string,
): Promise<ActionResult<AdminGymRequest>> {
  if (!(await requireOperator())) return { ok: false, error: 'Not authorized' };
  try {
    const request = await regenerateGymRequestLink(id);
    refreshRequests(id);
    return { ok: true, data: request };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function approveGymRequestAction(
  id: string,
): Promise<ActionResult<ApproveAdminGymRequestResponse>> {
  if (!(await requireOperator())) return { ok: false, error: 'Not authorized' };
  try {
    const result = await approveGymRequest(id);
    refreshRequests(id);
    revalidatePath(`/gyms/${result.gymId}`);
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function rejectGymRequestAction(
  id: string,
  reason?: string,
): Promise<ActionResult<AdminGymRequest>> {
  if (!(await requireOperator())) return { ok: false, error: 'Not authorized' };
  const parsed = rejectAdminGymRequestSchema.safeParse({ reason });
  if (!parsed.success) return { ok: false, error: 'Reason must be 500 characters or fewer.' };
  try {
    const request = await rejectGymRequest(id, parsed.data.reason);
    refreshRequests(id);
    return { ok: true, data: request };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
