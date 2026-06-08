'use server';

import { revalidatePath } from 'next/cache';
import {
  Permission,
  createSubscriptionPlanSchema,
  roleHasPermission,
  updateSubscriptionPlanSchema,
  type CreateSubscriptionPlanInput,
  type SetSubscriptionPlanStatusResponse,
  type UpdateSubscriptionPlanInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  createSubscriptionPlan,
  deactivateSubscriptionPlan,
  reactivateSubscriptionPlan,
  updateSubscriptionPlan,
} from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Re-assert a capability inside the action itself. The middleware gates the
 * `/subscriptions` route, but a Server Action is its own POST endpoint, so
 * re-checking here is defence in depth (the API re-checks again behind its
 * guards).
 */
async function sessionHas(permission: Permission): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, permission);
}

const requireBillingManage = () => sessionHas(Permission.BillingManage);

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message === 'SUBSCRIPTION_PLAN_NOT_FOUND') {
      return 'That subscription plan no longer exists.';
    }
    return `Request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/**
 * Create a subscription plan. Re-validates the body with the same Zod schema the
 * API uses, enforces `BillingManage`, then refreshes the roster cache. Returns the
 * new plan's `id` so the form can navigate to its detail page.
 */
export async function createSubscriptionPlanAction(
  input: CreateSubscriptionPlanInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireBillingManage())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = createSubscriptionPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid plan details' };
  }
  try {
    const plan = await createSubscriptionPlan(parsed.data);
    revalidatePath('/subscriptions');
    return { ok: true, data: { id: plan.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Edit a subscription plan's profile. Enforces `BillingManage`, re-validates the
 * body, and refreshes both the roster and the plan's detail page on success.
 */
export async function updateSubscriptionPlanAction(
  id: string,
  input: UpdateSubscriptionPlanInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireBillingManage())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = updateSubscriptionPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid plan details' };
  }
  try {
    await updateSubscriptionPlan(id, parsed.data);
    revalidatePath('/subscriptions');
    revalidatePath(`/subscriptions/${id}`);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Deactivate (`INACTIVE`) or reactivate (`ACTIVE`) a subscription plan. One action
 * behind a boolean keeps the two mirror-image transitions in a single place; both
 * enforce `BillingManage` and refresh the roster + detail caches.
 */
export async function setSubscriptionPlanActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ status: SetSubscriptionPlanStatusResponse['status'] }>> {
  if (!(await requireBillingManage())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const plan = active
      ? await reactivateSubscriptionPlan(id)
      : await deactivateSubscriptionPlan(id);
    revalidatePath('/subscriptions');
    revalidatePath(`/subscriptions/${id}`);
    return { ok: true, data: { status: plan.status } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
