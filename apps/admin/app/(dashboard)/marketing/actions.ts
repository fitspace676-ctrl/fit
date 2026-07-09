'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  Permission,
  createCampaignSchema,
  createMessageTemplateSchema,
  previewAudienceSchema,
  roleHasPermission,
  saveCampaignAsTemplateSchema,
  updateMessageTemplateSchema,
  type AudienceCriteria,
  type AudiencePreviewResponse,
  type CreateCampaignInput,
  type CreateMessageTemplateInput,
  type UpdateMessageTemplateInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  createCampaign,
  createMessageTemplate,
  deleteCampaign,
  deleteMessageTemplate,
  previewMarketingCriteria,
  previewMarketingSegment,
  saveCampaignAsTemplate,
  scheduleCampaign,
  sendCampaign,
  updateCampaign,
  updateMessageTemplate,
} from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Translator for the `admin.marketing` namespace (from `getTranslations`). */
type Translator = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Re-assert the Marketing write capability inside the action itself. Middleware
 * gates `/marketing` at MANAGER+, but writes are `MarketingManage` and a Server
 * Action is a POST endpoint in its own right — defence in depth ahead of the
 * API's own guards.
 */
async function requireManage(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.MarketingManage);
}

/** Re-assert the Marketing read capability (segment/criteria previews are reads). */
async function requireRead(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.MarketingRead);
}

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown, t: Translator): string {
  if (error instanceof ApiError) {
    switch (error.message) {
      case 'CAMPAIGN_NOT_FOUND':
        return t('errors.campaignNotFound');
      case 'CAMPAIGN_ALREADY_SENT':
        return t('errors.campaignAlreadySent');
      case 'TEMPLATE_NOT_FOUND':
        return t('errors.templateNotFound');
      case 'SEGMENT_NOT_FOUND':
        return t('errors.segmentNotFound');
      default:
        return t('errors.requestFailed', { status: error.status, message: error.message });
    }
  }
  return error instanceof Error ? error.message : t('errors.unexpected');
}

/** Refresh the marketing workspace after a mutation. */
function refresh(): void {
  revalidatePath('/marketing');
}

// ── Audience preview (reads) ──────────────────────────────────────────────────

/** Resolve ad-hoc criteria to a live count + sample for the wizard's audience step. */
export async function previewCriteriaAction(
  criteria: AudienceCriteria,
): Promise<ActionResult<AudiencePreviewResponse>> {
  const t = await getTranslations('admin.marketing');
  if (!(await requireRead())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = previewAudienceSchema.safeParse({ criteria });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const preview = await previewMarketingCriteria(parsed.data.criteria);
    return { ok: true, data: preview };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Resolve a saved segment to a live count + sample. */
export async function previewSegmentAction(
  id: string,
): Promise<ActionResult<AudiencePreviewResponse>> {
  const t = await getTranslations('admin.marketing');
  if (!(await requireRead())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  try {
    const preview = await previewMarketingSegment(id);
    return { ok: true, data: preview };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

// ── Message templates (CRUD) ──────────────────────────────────────────────────

/** Create a message template; returns the new template's id. */
export async function createTemplateAction(
  input: CreateMessageTemplateInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.marketing');
  if (!(await requireManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = createMessageTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const template = await createMessageTemplate(parsed.data);
    refresh();
    return { ok: true, data: { id: template.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Edit a message template — every field optional. */
export async function updateTemplateAction(
  id: string,
  input: UpdateMessageTemplateInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.marketing');
  if (!(await requireManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = updateMessageTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    await updateMessageTemplate(id, parsed.data);
    refresh();
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Delete a message template. */
export async function deleteTemplateAction(id: string): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.marketing');
  if (!(await requireManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  try {
    await deleteMessageTemplate(id);
    refresh();
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

// ── Campaigns (create → send/schedule, save-as-template, delete) ──────────────

/** How the wizard finishes a campaign: send immediately, schedule, or leave a draft. */
export type CampaignDispatch =
  | { mode: 'now' }
  | { mode: 'scheduled'; scheduledAt: string }
  | { mode: 'draft' };

/**
 * The wizard's terminal action: persist the campaign (create a new draft or edit
 * an existing one), then dispatch it — send now, schedule for later, or leave it
 * as a draft. Returns the campaign id + resolved status so the client can toast
 * the right message.
 */
export async function saveCampaignAction(
  id: string | null,
  input: CreateCampaignInput,
  dispatch: CampaignDispatch,
): Promise<ActionResult<{ id: string; dispatched: CampaignDispatch['mode'] }>> {
  const t = await getTranslations('admin.marketing');
  if (!(await requireManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  // The whole payload is always complete, so the stricter create schema
  // re-validates both paths (a full object satisfies the all-optional update
  // shape too); the API re-checks with its own schema regardless.
  const parsed = createCampaignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const campaign = id ? await updateCampaign(id, parsed.data) : await createCampaign(parsed.data);

    if (dispatch.mode === 'now') {
      await sendCampaign(campaign.id);
    } else if (dispatch.mode === 'scheduled') {
      await scheduleCampaign(campaign.id, { scheduledAt: dispatch.scheduledAt });
    }
    refresh();
    return { ok: true, data: { id: campaign.id, dispatched: dispatch.mode } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Duplicate a campaign into a fresh draft. Copies name (suffixed), channel,
 * audience, and content; the copy starts as an unsent draft the manager can edit.
 */
export async function duplicateCampaignAction(
  source: CreateCampaignInput & { name: string },
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.marketing');
  if (!(await requireManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = createCampaignSchema.safeParse({
    ...source,
    name: t('list.copyName', { name: source.name }).slice(0, 120),
    scheduleType: 'now',
    scheduledAt: null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const campaign = await createCampaign(parsed.data);
    refresh();
    return { ok: true, data: { id: campaign.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Save a campaign's message as a reusable template. */
export async function saveCampaignAsTemplateAction(
  id: string,
  name: string,
  category?: string,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.marketing');
  if (!(await requireManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const trimmed = name.trim();
  const parsed = saveCampaignAsTemplateSchema.safeParse({
    ...(trimmed ? { name: trimmed } : {}),
    category: category?.trim() ?? '',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const template = await saveCampaignAsTemplate(id, parsed.data);
    refresh();
    return { ok: true, data: { id: template.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Delete a campaign. */
export async function deleteCampaignAction(id: string): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.marketing');
  if (!(await requireManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  try {
    await deleteCampaign(id);
    refresh();
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}
