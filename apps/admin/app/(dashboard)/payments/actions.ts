'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
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
  fetchClassTypes,
  reactivateSubscriptionPlan,
  updateClassType,
  updateSubscriptionPlan,
} from '@/lib/api';

/**
 * How many class types one membership sync scans. The API's page cap, and far above
 * any realistic per-gym catalogue — a gym with more types than this would only leave
 * the overflow tail unlinked.
 */
const CLASS_TYPES_PAGE_LIMIT = 100;

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Re-assert a capability inside the action itself. The middleware gates the
 * `/payments` route, but a Server Action is its own POST endpoint, so
 * re-checking here is defence in depth (the API re-checks again behind its
 * guards).
 */
async function sessionHas(permission: Permission): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, permission);
}

const requireBillingManage = () => sessionHas(Permission.BillingManage);

type ErrorT = Awaited<ReturnType<typeof getTranslations>>;

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown, t: ErrorT): string {
  if (error instanceof ApiError) {
    if (error.message === 'SUBSCRIPTION_PLAN_NOT_FOUND') {
      return t('planNotFound');
    }
    return t('requestFailed', { status: error.status, message: error.message });
  }
  return error instanceof Error ? error.message : t('unexpected');
}

/** Map the first Zod validation issue to a localized message. */
function validationMessage(issues: ReadonlyArray<{ path: PropertyKey[] }>, t: ErrorT): string {
  const field = issues[0]?.path[0];
  if (field === 'name') {
    return t('validation.nameRequired');
  }
  if (field === 'priceAmount') {
    return t('validation.priceInvalid');
  }
  if (field === 'freezeDaysPerPeriod') {
    return t('validation.freezeInvalid');
  }
  return t('invalidPlanDetails');
}

/**
 * Create a subscription plan. Re-validates the body with the same Zod schema the
 * API uses, enforces `BillingManage`, then refreshes the roster cache. Returns the
 * new plan's `id` so the form can navigate to its detail page.
 */
export async function createSubscriptionPlanAction(
  input: CreateSubscriptionPlanInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.billingPlans.errors');
  if (!(await requireBillingManage())) {
    return { ok: false, error: t('notAuthorized') };
  }
  const parsed = createSubscriptionPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: validationMessage(parsed.error.issues, t) };
  }
  try {
    const plan = await createSubscriptionPlan(parsed.data);
    revalidatePath('/payments');
    return { ok: true, data: { id: plan.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
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
  const t = await getTranslations('admin.billingPlans.errors');
  if (!(await requireBillingManage())) {
    return { ok: false, error: t('notAuthorized') };
  }
  const parsed = updateSubscriptionPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: validationMessage(parsed.error.issues, t) };
  }
  try {
    await updateSubscriptionPlan(id, parsed.data);
    revalidatePath('/payments');
    revalidatePath(`/payments/${id}`);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
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
  const t = await getTranslations('admin.billingPlans.errors');
  if (!(await requireBillingManage())) {
    return { ok: false, error: t('notAuthorized') };
  }
  try {
    const plan = active
      ? await reactivateSubscriptionPlan(id)
      : await deactivateSubscriptionPlan(id);
    revalidatePath('/payments');
    revalidatePath(`/payments/${id}`);
    return { ok: true, data: { status: plan.status } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Sync which class types a plan covers, written from the plan's side of the
 * relation.
 *
 * There is no `SubscriptionPlan.classTypeIds` column: coverage lives on the class
 * type as `pricingRule = INCLUDED` + `includedPlanIds`, which is what the classes
 * screen edits. Rather than duplicate that (two sources of truth that drift), the
 * plan form writes the same relation from the other end — each class type in
 * `classTypeIds` gains this plan id, each one that no longer wants it loses it.
 *
 * Two rules keep the class catalogue intact:
 *
 *  • **`PAID` types are never touched.** They carry a per-session `priceMinor` that
 *    flipping to `INCLUDED` would strip, so the plan picker doesn't offer them and
 *    this loop skips them even if an id is passed.
 *  • **A type that loses its last plan falls back to `FREE`.** `INCLUDED` with an
 *    empty `includedPlanIds` fails validation, and `PAID` would need a price we
 *    don't have — so the class becomes open to every member.
 *
 * Requires `BillingManage` (it's driven from the billing screen) *and* `ClassWrite`
 * (it mutates class types); the API re-checks the latter on every PATCH.
 */
export async function setPlanClassTypesAction(
  planId: string,
  classTypeIds: string[],
): Promise<ActionResult<{ updated: number }>> {
  const t = await getTranslations('admin.billingPlans.errors');
  if (!(await requireBillingManage()) || !(await sessionHas(Permission.ClassWrite))) {
    return { ok: false, error: t('notAuthorized') };
  }
  try {
    const wanted = new Set(classTypeIds);
    const { data: types } = await fetchClassTypes({
      limit: CLASS_TYPES_PAGE_LIMIT,
      sort: 'name',
      dir: 'asc',
    });

    let updated = 0;
    for (const type of types) {
      if (type.pricingRule === 'PAID') {
        continue;
      }
      const covered = type.includedPlanIds.includes(planId);
      if (covered === wanted.has(type.id)) {
        continue;
      }
      const includedPlanIds = covered
        ? type.includedPlanIds.filter((id) => id !== planId)
        : [...type.includedPlanIds, planId];
      await updateClassType(type.id, {
        pricingRule: includedPlanIds.length > 0 ? 'INCLUDED' : 'FREE',
        includedPlanIds,
      });
      updated += 1;
    }

    revalidatePath('/payments');
    revalidatePath(`/payments/${planId}`);
    // The classes board renders each type's pricing badge from what just changed.
    revalidatePath('/classes');
    return { ok: true, data: { updated } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}
