'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  Permission,
  createAutomationRuleSchema,
  roleHasPermission,
  saveAsTemplateSchema,
  updateAutomationRuleSchema,
  type CreateAutomationRuleInput,
  type UpdateAutomationRuleInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  createAutomationRule,
  deleteAutomationRule,
  saveAutomationRuleAsTemplate,
  toggleAutomationRule,
  updateAutomationRule,
} from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Translator for the `admin.automation` namespace (from `getTranslations`). */
type Translator = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Re-assert the Automation write capability inside the action itself. Middleware
 * already gates `/automation` at MANAGER+, but writes are `AutomationManage`
 * and a Server Action is a POST endpoint in its own right — defence in depth
 * ahead of the API's own guards.
 */
async function requireManage(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.AutomationManage);
}

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown, t: Translator): string {
  if (error instanceof ApiError) {
    if (error.message === 'AUTOMATION_RULE_NOT_FOUND') {
      return t('errors.ruleNotFound');
    }
    if (error.message === 'AUTOMATION_TEMPLATE_NOT_TOGGLEABLE') {
      return t('errors.templateNotActivatable');
    }
    return t('errors.requestFailed', { status: error.status, message: error.message });
  }
  return error instanceof Error ? error.message : t('errors.unexpected');
}

/** Refresh the rules workspace after a mutation. */
function refresh(): void {
  revalidatePath('/automation');
}

/**
 * Create an automation rule (active by default). Re-validates the body with the
 * same Zod schema the API uses, enforces `AutomationManage`, then refreshes the
 * workspace. Returns the new rule's `id`.
 */
export async function createAutomationRuleAction(
  input: CreateAutomationRuleInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.automation');
  if (!(await requireManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = createAutomationRuleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const rule = await createAutomationRule(parsed.data);
    refresh();
    return { ok: true, data: { id: rule.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Edit an automation rule — every field optional; the per-trigger `days` rule applies. */
export async function updateAutomationRuleAction(
  id: string,
  input: UpdateAutomationRuleInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.automation');
  if (!(await requireManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = updateAutomationRuleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    await updateAutomationRule(id, parsed.data);
    refresh();
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Flip a rule's active state (a template can't be activated — the API rejects it). */
export async function toggleAutomationRuleAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string; active: boolean }>> {
  const t = await getTranslations('admin.automation');
  if (!(await requireManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  try {
    const rule = await toggleAutomationRule(id, active);
    refresh();
    return { ok: true, data: { id, active: rule.active } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Save an existing rule as a reusable, inactive template (optionally renaming the copy). */
export async function saveAsTemplateAction(
  id: string,
  name?: string,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.automation');
  if (!(await requireManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const trimmed = name?.trim();
  const parsed = saveAsTemplateSchema.safeParse(trimmed ? { name: trimmed } : {});
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const template = await saveAutomationRuleAsTemplate(id, parsed.data);
    refresh();
    return { ok: true, data: { id: template.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Delete an automation rule (and its run log). */
export async function deleteAutomationRuleAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.automation');
  if (!(await requireManage())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  try {
    await deleteAutomationRule(id);
    refresh();
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}
