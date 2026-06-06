'use server';

import { revalidatePath } from 'next/cache';
import {
  Permission,
  createPackagePlanSchema,
  roleHasPermission,
  updatePackagePlanSchema,
  type CreatePackagePlanInput,
  type SetPackagePlanStatusResponse,
  type UpdatePackagePlanInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  createPackagePlan,
  deactivatePackagePlan,
  reactivatePackagePlan,
  updatePackagePlan,
} from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Re-assert a capability inside the action itself. The middleware gates the
 * `/packages` route, but a Server Action is its own POST endpoint, so re-checking
 * here is defence in depth (the API re-checks again behind its guards).
 */
async function sessionHas(permission: Permission): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, permission);
}

const requirePackageWrite = () => sessionHas(Permission.PackageWrite);

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message === 'PACKAGE_PLAN_NOT_FOUND') {
      return 'That package plan no longer exists.';
    }
    return `Request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/**
 * Create a package plan. Re-validates the body with the same Zod schema the API
 * uses, enforces `PackageWrite`, then refreshes the roster cache. Returns the new
 * plan's `id` so the form can navigate to its detail page.
 */
export async function createPackagePlanAction(
  input: CreatePackagePlanInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requirePackageWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = createPackagePlanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid plan details' };
  }
  try {
    const plan = await createPackagePlan(parsed.data);
    revalidatePath('/packages');
    return { ok: true, data: { id: plan.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Edit a package plan's profile. Enforces `PackageWrite`, re-validates the body,
 * and refreshes both the roster and the plan's detail page on success.
 */
export async function updatePackagePlanAction(
  id: string,
  input: UpdatePackagePlanInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requirePackageWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = updatePackagePlanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid plan details' };
  }
  try {
    await updatePackagePlan(id, parsed.data);
    revalidatePath('/packages');
    revalidatePath(`/packages/${id}`);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Deactivate (`INACTIVE`) or reactivate (`ACTIVE`) a package plan. One action
 * behind a boolean keeps the two mirror-image transitions in a single place; both
 * enforce `PackageWrite` and refresh the roster + detail caches.
 */
export async function setPackagePlanActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ status: SetPackagePlanStatusResponse['status'] }>> {
  if (!(await requirePackageWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const plan = active ? await reactivatePackagePlan(id) : await deactivatePackagePlan(id);
    revalidatePath('/packages');
    revalidatePath(`/packages/${id}`);
    return { ok: true, data: { status: plan.status } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
