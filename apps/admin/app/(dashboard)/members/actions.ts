'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  Permission,
  createMemberNoteSchema,
  createMemberSchema,
  createMemberTaskSchema,
  freezeSubscriptionSchema,
  purchaseCreditPackSchema,
  roleHasPermission,
  updateMemberSchema,
  updateMemberTaskSchema,
  type BulkExportMembersInput,
  type CreateMemberInput,
  type CreateMemberNoteInput,
  type CreateMemberTaskInput,
  type FreezeSubscriptionInput,
  type MemberDetail,
  type MemberTaskStatus,
  type UpdateMemberInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  bulkExportMembers,
  createMember,
  createMemberNote,
  createMemberTask,
  deactivateMember,
  fetchSubscriptionPlans,
  freezeMemberSubscription,
  grantMemberCreditPack,
  reactivateMember,
  unfreezeMemberSubscription,
  updateMember,
  updateMemberTask,
} from '@/lib/api';

/** A membership plan option for the Add-Member form's plan selector. */
export interface PlanOption {
  id: string;
  name: string;
  priceAmount: number;
  currency: string;
  interval: 'MONTH' | 'YEAR';
}

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Translator for the `admin.members` namespace (from `getTranslations`). */
type Translator = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Re-assert a capability inside the action itself. The middleware already gates
 * the `/members` route, but a Server Action is a POST endpoint in its own right,
 * so re-checking the session's capability here keeps it safe even if the matcher
 * ever changes — defence in depth, not a substitute for the gate. (The API
 * re-checks again behind its own guards.)
 */
async function sessionHas(permission: Permission): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, permission);
}

const requireMemberRead = () => sessionHas(Permission.MemberRead);
const requireMemberWrite = () => sessionHas(Permission.MemberWrite);
const requireBillingManage = () => sessionHas(Permission.BillingManage);

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown, t: Translator): string {
  if (error instanceof ApiError) {
    // The API returns a stable error code (e.g. MEMBER_EXISTS) — translate the
    // ones staff act on to plain language; otherwise show the code + status.
    if (error.message === 'MEMBER_EXISTS') {
      return t('errors.memberExists');
    }
    if (error.message === 'MEMBER_NOT_FOUND') {
      return t('errors.memberNotFound');
    }
    // Freeze/unfreeze (T5.7) — map the stable API codes to staff-facing lines.
    if (error.message === 'EXCEEDS_FREEZE_ALLOWANCE') {
      return t('errors.freezeAllowance');
    }
    if (error.message === 'ALREADY_FROZEN') {
      return t('errors.alreadyFrozen');
    }
    if (error.message === 'NOT_FROZEN') {
      return t('errors.notFrozen');
    }
    if (error.message === 'SUBSCRIPTION_NOT_FREEZABLE') {
      return t('errors.notFreezable');
    }
    if (error.message === 'SUBSCRIPTION_NOT_FOUND') {
      return t('errors.subscriptionNotFound');
    }
    // Credit-pack grant (T5.8).
    if (error.message === 'PACK_UNAVAILABLE') {
      return t('errors.packUnavailable');
    }
    return t('errors.requestFailed', { status: error.status, message: error.message });
  }
  return error instanceof Error ? error.message : t('errors.unexpected');
}

/**
 * Enqueue a CSV export of the given members (or, with no `ids`, the current
 * filtered view) and hand the `jobId` back to the table so it can surface
 * progress. The CSV is produced asynchronously and streamed API-side, so this
 * returns immediately with the job handle rather than the file.
 */
export async function bulkExportMembersAction(
  input: BulkExportMembersInput,
): Promise<ActionResult<{ jobId: string }>> {
  const t = await getTranslations('admin.members');
  if (!(await requireMemberRead())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  try {
    const { jobId } = await bulkExportMembers(input);
    return { ok: true, data: { jobId } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Create a member. Re-validates the body with the same Zod schema the API uses
 * (so a malformed submission fails fast, client-side of the API), enforces
 * `MemberWrite`, then refreshes the roster cache. Returns the new member's `id`
 * so the form can navigate to its detail page.
 */
export async function createMemberAction(
  input: CreateMemberInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.members');
  if (!(await requireMemberWrite())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = createMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const member = await createMember(parsed.data);
    revalidatePath('/members');
    return { ok: true, data: { id: member.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Edit a member's profile (`name` / `phone`). Enforces `MemberWrite`, re-validates
 * the body, and refreshes both the roster and the member's detail page on success.
 */
export async function updateMemberAction(
  id: string,
  input: UpdateMemberInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.members');
  if (!(await requireMemberWrite())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = updateMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    await updateMember(id, parsed.data);
    revalidatePath('/members');
    revalidatePath(`/members/${id}`);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Deactivate (`SUSPENDED`) or reactivate (`ACTIVE`) a member. One action behind a
 * boolean keeps the two mirror-image lifecycle transitions in a single place;
 * both enforce `MemberWrite` and refresh the roster + detail caches.
 */
export async function setMemberActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ status: MemberDetail['status'] }>> {
  const t = await getTranslations('admin.members');
  if (!(await requireMemberWrite())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  try {
    const member = active ? await reactivateMember(id) : await deactivateMember(id);
    revalidatePath('/members');
    revalidatePath(`/members/${id}`);
    return { ok: true, data: { status: member.status } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Freeze (pause) a member's subscription from the console (T5.7). `subscriptionId`
 * is the member's live subscription; `memberId` is the detail page to refresh.
 * Gated by `BillingManage` (the API re-checks) and re-validates the body with the
 * same Zod schema the API uses. On success the member's detail page is refreshed so
 * the "Current plan" panel reflects the frozen state.
 */
export async function freezeMemberSubscriptionAction(
  memberId: string,
  subscriptionId: string,
  input: FreezeSubscriptionInput,
): Promise<ActionResult<{ frozenUntil: string }>> {
  const t = await getTranslations('admin.members');
  if (!(await requireBillingManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = freezeSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const { frozenUntil } = await freezeMemberSubscription(subscriptionId, parsed.data);
    revalidatePath('/members');
    revalidatePath(`/members/${memberId}`);
    return { ok: true, data: { frozenUntil } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Sell / grant a credit pack to a member from the console (T5.8). `memberId` is the
 * detail page to refresh; `packId` names the catalogue pack. Gated by `BillingManage`
 * (the API re-checks) and re-validated with the same Zod schema the API uses. On
 * success the member's detail page is refreshed so the credit balance updates.
 */
export async function grantMemberCreditPackAction(
  memberId: string,
  packId: string,
): Promise<ActionResult<{ creditPackId: string }>> {
  const t = await getTranslations('admin.members');
  if (!(await requireBillingManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = purchaseCreditPackSchema.safeParse({ packId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const { creditPackId } = await grantMemberCreditPack(memberId, parsed.data);
    revalidatePath('/members');
    revalidatePath(`/members/${memberId}`);
    return { ok: true, data: { creditPackId } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * List the gym's active membership plans for the Add-Member form's plan selector.
 * Gated by `MemberWrite` (the form is a write surface). Returns a compact option
 * list; on any failure it degrades to an empty list so the form still works
 * without plan enrolment.
 */
export async function listActivePlanOptionsAction(): Promise<PlanOption[]> {
  if (!(await requireMemberWrite())) {
    return [];
  }
  try {
    const { data } = await fetchSubscriptionPlans({ status: 'ACTIVE', limit: 100 });
    return data.map((plan) => ({
      id: plan.id,
      name: plan.name,
      priceAmount: plan.priceAmount,
      currency: plan.currency,
      interval: plan.interval,
    }));
  } catch {
    return [];
  }
}

/**
 * Add a staff note to a member (T4.x). Enforces `MemberWrite`, re-validates the
 * body with the same Zod schema the API uses, then refreshes the member's detail
 * page so the new note appears. The author is resolved API-side from the session.
 */
export async function addMemberNoteAction(
  memberId: string,
  input: CreateMemberNoteInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.members');
  if (!(await requireMemberWrite())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = createMemberNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    await createMemberNote(memberId, parsed.data);
    revalidatePath(`/members/${memberId}`);
    return { ok: true, data: { id: memberId } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Log a follow-up task against a member (T4.x). Enforces `MemberWrite`,
 * re-validates the body, and refreshes the member's detail page on success.
 */
export async function addMemberTaskAction(
  memberId: string,
  input: CreateMemberTaskInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.members');
  if (!(await requireMemberWrite())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = createMemberTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    await createMemberTask(memberId, parsed.data);
    revalidatePath(`/members/${memberId}`);
    return { ok: true, data: { id: memberId } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Toggle a member task between pending and done (T4.x). Enforces `MemberWrite` and
 * refreshes the member's detail page so the task list reflects the new state.
 */
export async function toggleMemberTaskAction(
  memberId: string,
  taskId: string,
  status: MemberTaskStatus,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.members');
  if (!(await requireMemberWrite())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = updateMemberTaskSchema.safeParse({ status });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    await updateMemberTask(memberId, taskId, parsed.data);
    revalidatePath(`/members/${memberId}`);
    return { ok: true, data: { id: taskId } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Resume a member's frozen subscription from the console (T5.7). See {@link freezeMemberSubscriptionAction}. */
export async function unfreezeMemberSubscriptionAction(
  memberId: string,
  subscriptionId: string,
): Promise<ActionResult<{ newPeriodEnd: string }>> {
  const t = await getTranslations('admin.members');
  if (!(await requireBillingManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  try {
    const { newPeriodEnd } = await unfreezeMemberSubscription(subscriptionId);
    revalidatePath('/members');
    revalidatePath(`/members/${memberId}`);
    return { ok: true, data: { newPeriodEnd } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}
