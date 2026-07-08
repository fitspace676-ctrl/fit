'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  Permission,
  createCrmActivitySchema,
  createCrmTaskSchema,
  createLeadSchema,
  createOpportunitySchema,
  markLostSchema,
  markWonSchema,
  roleHasPermission,
  updateCrmTaskSchema,
  updateLeadSchema,
  updateOpportunitySchema,
  type CreateCrmActivityInput,
  type CreateCrmTaskInput,
  type CreateLeadInput,
  type CreateOpportunityInput,
  type UpdateLeadInput,
  type UpdateOpportunityInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  convertLead,
  createCrmActivity,
  createCrmTask,
  createLead,
  createOpportunity,
  deleteLead,
  deleteOpportunity,
  loseLead,
  loseOpportunity,
  updateCrmTask,
  updateLead,
  updateOpportunity,
  winOpportunity,
} from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Translator for the `admin.crm` namespace (from `getTranslations`). */
type Translator = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Re-assert the CRM write capability inside the action itself. The middleware
 * already gates the `/crm` route (RECEPTIONIST+), but writes are `CrmManage`
 * (OWNER / MANAGER), and a Server Action is a POST endpoint in its own right —
 * defence in depth ahead of the API's own guards.
 */
async function requireCrmManage(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.CrmManage);
}

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown, t: Translator): string {
  if (error instanceof ApiError) {
    if (error.message === 'LEAD_NOT_FOUND') {
      return t('errors.leadNotFound');
    }
    if (error.message === 'OPPORTUNITY_NOT_FOUND') {
      return t('errors.opportunityNotFound');
    }
    if (error.message === 'MEMBER_NOT_FOUND') {
      return t('errors.memberNotFound');
    }
    if (error.message === 'CRM_ASSIGNEE_INVALID') {
      return t('errors.assigneeInvalid');
    }
    if (error.message === 'CRM_LOCATION_INVALID') {
      return t('errors.locationInvalid');
    }
    if (error.message === 'CRM_TASK_NOT_FOUND') {
      return t('errors.taskNotFound');
    }
    return t('errors.requestFailed', { status: error.status, message: error.message });
  }
  return error instanceof Error ? error.message : t('errors.unexpected');
}

/** Refresh the roster and (when known) the lead's detail page. */
function refreshLead(id?: string): void {
  revalidatePath('/crm');
  if (id) {
    revalidatePath(`/crm/leads/${id}`);
  }
}

/**
 * Capture a lead. Re-validates the body with the same Zod schema the API uses,
 * enforces `CrmManage`, then refreshes the roster. Returns the new lead's `id`
 * so the form can navigate to its detail page.
 */
export async function createLeadAction(
  input: CreateLeadInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.crm');
  if (!(await requireCrmManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = createLeadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const lead = await createLead(parsed.data);
    refreshLead(lead.id);
    return { ok: true, data: { id: lead.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Edit a lead — profile fields plus open-stage `status` moves (NEW / CONTACTED /
 * TRIAL). Closing as CONVERTED / LOST goes through {@link convertLeadAction} /
 * {@link loseLeadAction} so the reason is always captured with the close.
 */
export async function updateLeadAction(
  id: string,
  input: UpdateLeadInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.crm');
  if (!(await requireCrmManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = updateLeadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    await updateLead(id, parsed.data);
    refreshLead(id);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Close a lead CONVERTED, recording the (optional) win reason. */
export async function convertLeadAction(
  id: string,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.crm');
  if (!(await requireCrmManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = markWonSchema.safeParse({ reason });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    await convertLead(id, parsed.data);
    refreshLead(id);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Close a lead LOST, recording the required loss reason. */
export async function loseLeadAction(
  id: string,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.crm');
  if (!(await requireCrmManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = markLostSchema.safeParse({ reason });
  if (!parsed.success) {
    return { ok: false, error: t('dialogs.lostReasonRequired') };
  }
  try {
    await loseLead(id, parsed.data);
    refreshLead(id);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Delete a lead (its activities and tasks cascade with it). */
export async function deleteLeadAction(id: string): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.crm');
  if (!(await requireCrmManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  try {
    await deleteLead(id);
    refreshLead();
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Log a touchpoint (call / email / WhatsApp / meeting / note) on a lead's
 * timeline. The acting staff member is resolved from the session API-side.
 */
export async function logLeadActivityAction(
  leadId: string,
  input: Omit<CreateCrmActivityInput, 'leadId' | 'opportunityId'>,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.crm');
  if (!(await requireCrmManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = createCrmActivitySchema.safeParse({ ...input, leadId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const { activity } = await createCrmActivity(parsed.data);
    refreshLead(leadId);
    return { ok: true, data: { id: activity.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Add a follow-up task to a lead. */
export async function createLeadTaskAction(
  leadId: string,
  input: Omit<CreateCrmTaskInput, 'leadId' | 'opportunityId'>,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.crm');
  if (!(await requireCrmManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = createCrmTaskSchema.safeParse({ ...input, leadId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const { task } = await createCrmTask(parsed.data);
    refreshLead(leadId);
    return { ok: true, data: { id: task.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Toggle a lead task between pending and completed. Completing it auto-logs a
 * `TASK_COMPLETED` activity on the lead's timeline API-side.
 */
export async function toggleLeadTaskAction(
  leadId: string,
  taskId: string,
  completed: boolean,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.crm');
  if (!(await requireCrmManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = updateCrmTaskSchema.safeParse({ completed });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    await updateCrmTask(taskId, parsed.data);
    refreshLead(leadId);
    return { ok: true, data: { id: taskId } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

// ---------------------------------------------------------------------------
// Opportunities (T12.4)
// ---------------------------------------------------------------------------

/** Refresh the CRM workspace and (when known) the opportunity's detail page. */
function refreshOpportunity(id?: string): void {
  revalidatePath('/crm');
  if (id) {
    revalidatePath(`/crm/opportunities/${id}`);
  }
}

/**
 * Open an opportunity on an existing member. Re-validates with the same Zod
 * schema the API uses, enforces `CrmManage`, then refreshes the workspace.
 * Returns the new opportunity's `id` so the form can navigate to its detail.
 */
export async function createOpportunityAction(
  input: CreateOpportunityInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.crm');
  if (!(await requireCrmManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = createOpportunitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const opportunity = await createOpportunity(parsed.data);
    refreshOpportunity(opportunity.id);
    return { ok: true, data: { id: opportunity.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Edit an opportunity — deal fields plus open-stage `status` moves (INTERESTED /
 * PROPOSAL_SENT / DECISION_PENDING). Closing as WON / LOST goes through
 * {@link winOpportunityAction} / {@link loseOpportunityAction} so the reason is
 * always captured with the close.
 */
export async function updateOpportunityAction(
  id: string,
  input: UpdateOpportunityInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.crm');
  if (!(await requireCrmManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = updateOpportunitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    await updateOpportunity(id, parsed.data);
    refreshOpportunity(id);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Close an opportunity WON, recording the (optional) win reason. */
export async function winOpportunityAction(
  id: string,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.crm');
  if (!(await requireCrmManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = markWonSchema.safeParse({ reason });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    await winOpportunity(id, parsed.data);
    refreshOpportunity(id);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Close an opportunity LOST, recording the required loss reason. */
export async function loseOpportunityAction(
  id: string,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.crm');
  if (!(await requireCrmManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = markLostSchema.safeParse({ reason });
  if (!parsed.success) {
    return { ok: false, error: t('dialogs.lostReasonRequired') };
  }
  try {
    await loseOpportunity(id, parsed.data);
    refreshOpportunity(id);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Delete an opportunity (its activities and tasks cascade with it). */
export async function deleteOpportunityAction(id: string): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.crm');
  if (!(await requireCrmManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  try {
    await deleteOpportunity(id);
    refreshOpportunity();
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Log a touchpoint (call / email / WhatsApp / meeting / note) on an
 * opportunity's timeline. The acting staff member is resolved from the session
 * API-side.
 */
export async function logOpportunityActivityAction(
  opportunityId: string,
  input: Omit<CreateCrmActivityInput, 'leadId' | 'opportunityId'>,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.crm');
  if (!(await requireCrmManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = createCrmActivitySchema.safeParse({ ...input, opportunityId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const { activity } = await createCrmActivity(parsed.data);
    refreshOpportunity(opportunityId);
    return { ok: true, data: { id: activity.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Add a follow-up task to an opportunity. */
export async function createOpportunityTaskAction(
  opportunityId: string,
  input: Omit<CreateCrmTaskInput, 'leadId' | 'opportunityId'>,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.crm');
  if (!(await requireCrmManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = createCrmTaskSchema.safeParse({ ...input, opportunityId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const { task } = await createCrmTask(parsed.data);
    refreshOpportunity(opportunityId);
    return { ok: true, data: { id: task.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Toggle an opportunity task between pending and completed. Completing it
 * auto-logs a `TASK_COMPLETED` activity on the opportunity's timeline API-side.
 */
export async function toggleOpportunityTaskAction(
  opportunityId: string,
  taskId: string,
  completed: boolean,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.crm');
  if (!(await requireCrmManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = updateCrmTaskSchema.safeParse({ completed });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    await updateCrmTask(taskId, parsed.data);
    refreshOpportunity(opportunityId);
    return { ok: true, data: { id: taskId } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}
