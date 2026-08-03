'use server';

import { revalidatePath } from 'next/cache';
import {
  Permission,
  emailTemplateKeySchema,
  roleHasPermission,
  updateEmailTemplateSchema,
  type EmailTemplateRow,
  type UpdateEmailTemplateInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, resetEmailTemplate, updateEmailTemplate } from '@/lib/api';

/** Discriminated result handed back to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Re-assert the capability inside the action. The route is already gated, but a
 * Server Action is its own POST endpoint, so this is defence in depth — and the
 * API checks again behind its own guard.
 */
async function canManage(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.GymManage);
}

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `Could not save (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/** Save this gym's wording for one system email. */
export async function saveEmailTemplateAction(
  key: string,
  input: UpdateEmailTemplateInput,
): Promise<ActionResult<EmailTemplateRow>> {
  if (!(await canManage())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsedKey = emailTemplateKeySchema.safeParse(key);
  if (!parsedKey.success) {
    return { ok: false, error: 'Unknown email template' };
  }
  const parsed = updateEmailTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid wording' };
  }
  try {
    const row = await updateEmailTemplate(parsedKey.data, parsed.data);
    revalidatePath('/settings/email-templates');
    return { ok: true, data: row };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/** Discard this gym's wording and go back to the built-in default. */
export async function resetEmailTemplateAction(
  key: string,
): Promise<ActionResult<EmailTemplateRow>> {
  if (!(await canManage())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsedKey = emailTemplateKeySchema.safeParse(key);
  if (!parsedKey.success) {
    return { ok: false, error: 'Unknown email template' };
  }
  try {
    const row = await resetEmailTemplate(parsedKey.data);
    revalidatePath('/settings/email-templates');
    return { ok: true, data: row };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
