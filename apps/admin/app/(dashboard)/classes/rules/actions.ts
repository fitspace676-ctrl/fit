'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  Permission,
  updateClassRulesSchema,
  type ClassRules,
  type UpdateClassRulesInput,
} from '@fit/types';
import { ApiError, updateClassRules } from '@/lib/api';
import { consoleCan } from '@/lib/console-permissions';
import { getConsolePermissions } from '@/lib/permissions-server';

export type ClassRulesResult = { ok: true; data: ClassRules } | { ok: false; error: string };

/**
 * Save the class-booking rules. Re-checks `ClassWrite` here (a Server Action is
 * its own POST endpoint) and re-validates with the API's schema; the API guards
 * the route with the same permission.
 */
export async function updateClassRulesAction(
  input: UpdateClassRulesInput,
): Promise<ClassRulesResult> {
  const t = await getTranslations('admin.settings.errors');
  if (!consoleCan(await getConsolePermissions(), Permission.ClassWrite)) {
    return { ok: false, error: t('notAuthorized') };
  }
  const parsed = updateClassRulesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('invalid') };
  }
  try {
    const rules = await updateClassRules(parsed.data);
    revalidatePath('/classes/rules');
    return { ok: true, data: rules };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        ok: false,
        error:
          error.status === 403
            ? t('forbidden')
            : t('requestFailed', { status: error.status, message: error.message }),
      };
    }
    return { ok: false, error: error instanceof Error ? error.message : t('unexpected') };
  }
}
