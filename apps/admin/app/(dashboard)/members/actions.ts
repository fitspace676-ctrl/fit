'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  Permission,
  createMemberNoteSchema,
  createMemberSchema,
  dashboardMembersQuerySchema,
  freezeSubscriptionSchema,
  purchaseCreditPackSchema,
  roleHasPermission,
  sendMemberEmailSchema,
  updateMemberSchema,
  type BulkExportMembersInput,
  type CreateMemberInput,
  type CreateMemberNoteInput,
  type DashboardMembersQuery,
  type DashboardMembersResponse,
  type EmailTemplateOption,
  type FreezeSubscriptionInput,
  type MemberDetail,
  type SendMemberEmailInput,
  type UpdateMemberInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  bulkExportMembers,
  createMember,
  createMemberNote,
  deactivateMember,
  fetchAutomationTemplates,
  fetchDashboardMembers,
  fetchMessageTemplates,
  fetchSubscriptionPlans,
  freezeMemberSubscription,
  grantMemberCreditPack,
  reactivateMember,
  restoreMember,
  sendMemberEmail,
  trashMember,
  unfreezeMemberSubscription,
  updateMember,
} from '@/lib/api';

/**
 * What {@link createMemberAction} hands back — enough for a caller to act on the
 * new member without a second round trip. The roster navigates to the detail
 * page; the POS till attaches them to the sale in progress.
 */
export interface CreatedMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

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
    // Member email (T-member-email).
    if (error.message === 'EMAIL_NOT_CONFIGURED') {
      return t('email.notConfigured');
    }
    if (error.message === 'EMAIL_SEND_FAILED') {
      return t('email.sendFailed');
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
 * `MemberWrite`, then refreshes the roster cache.
 *
 * Returns enough of the new member to act on without a second fetch: the roster
 * navigates to `id`, while the POS till needs the name and contact details to
 * attach them to the sale in progress.
 */
export async function createMemberAction(
  input: CreateMemberInput,
): Promise<ActionResult<CreatedMember>> {
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
    return {
      ok: true,
      data: { id: member.id, name: member.name, email: member.email, phone: member.phone },
    };
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
 * Move a member to trash (soft-delete) or restore a trashed one — the two
 * mirror-image transitions behind a boolean, matching {@link setMemberActiveAction}.
 * Both enforce `MemberWrite` and refresh the roster + detail caches so the moved
 * member drops out of (or returns to) the live views immediately.
 */
export async function setMemberTrashedAction(
  id: string,
  trashed: boolean,
): Promise<ActionResult<{ deletedAt: string | null }>> {
  const t = await getTranslations('admin.members');
  if (!(await requireMemberWrite())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  try {
    const member = trashed ? await trashMember(id) : await restoreMember(id);
    revalidatePath('/members');
    revalidatePath(`/members/${id}`);
    return { ok: true, data: { deletedAt: member.deletedAt } };
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
 * The gym's reusable **email** templates for the member-email drawer's picker, unified
 * from both stores: marketing message templates (`channel: 'email'`) and automation
 * email-action templates (`actionType: 'email'`). Each store is fetched independently
 * (`allSettled`) so one being unavailable — no access, or the fetch failing — never
 * hides the other, and an empty list is a valid result (custom compose always works).
 */
export async function listEmailTemplatesAction(): Promise<EmailTemplateOption[]> {
  if (!(await requireMemberWrite())) {
    return [];
  }
  const [marketing, automation] = await Promise.allSettled([
    fetchMessageTemplates(),
    fetchAutomationTemplates(),
  ]);

  const options: EmailTemplateOption[] = [];
  if (marketing.status === 'fulfilled') {
    for (const template of marketing.value.data) {
      if (template.channel !== 'email') continue;
      options.push({
        id: `marketing:${template.id}`,
        name: template.name,
        subject: template.subject ?? '',
        body: template.body,
        source: 'marketing',
      });
    }
  }
  if (automation.status === 'fulfilled') {
    for (const rule of automation.value.data) {
      if (rule.actionType !== 'email') continue;
      options.push({
        id: `automation:${rule.id}`,
        name: rule.name,
        subject: rule.actionConfig.subject ?? '',
        body: rule.actionConfig.body,
        source: 'automation',
      });
    }
  }
  return options;
}

/**
 * Send a one-off staff email to a member. Enforces `MemberWrite`, re-validates the
 * `{ subject, body }` body, and maps a not-configured mailer to a clear staff message
 * (never a false success). The client sends the final, already-personalized text.
 */
export async function sendMemberEmailAction(
  memberId: string,
  input: SendMemberEmailInput,
): Promise<ActionResult<{ sent: boolean }>> {
  const t = await getTranslations('admin.members');
  if (!(await requireMemberWrite())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = sendMemberEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const { sent } = await sendMemberEmail(memberId, parsed.data);
    return { ok: true, data: { sent } };
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

/**
 * Load the whole Members tab. Re-asserts the reporting capability first: the
 * middleware gates the route, but a Server Action is a POST endpoint in its own
 * right — defence in depth ahead of the API's own guard. Errors come back as a
 * message so a failed load stays local to the tab.
 */
export async function loadMembersAction(
  query: DashboardMembersQuery,
): Promise<ActionResult<DashboardMembersResponse>> {
  const t = await getTranslations('admin.dashboard.members');
  const session = await getServerSession();
  if (session === null || !roleHasPermission(session.role, Permission.ReportView)) {
    return { ok: false, error: t('loadError') };
  }
  try {
    // Re-parsed rather than trusted: the argument crosses a network boundary like
    // any other request body, so it is validated here as well as API-side.
    return {
      ok: true,
      data: await fetchDashboardMembers(dashboardMembersQuerySchema.parse(query)),
    };
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? error.message : t('loadError') };
  }
}
