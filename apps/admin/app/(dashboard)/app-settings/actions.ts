'use server';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  Permission,
  updateMobileAppSettingsSchema,
  type MobileAppSettings,
  type UpdateMobileAppSettingsInput,
} from '@fit/types';
import { getConsolePermissions } from '@/lib/permissions-server';
import { consoleCan } from '@/lib/console-permissions';
import { updateMobileAppSettings } from '@/lib/api';

export async function updateAppSettingsAction(
  input: UpdateMobileAppSettingsInput,
): Promise<{ ok: true; data: MobileAppSettings } | { ok: false; error: string }> {
  const t = await getTranslations('admin.appSettings');
  if (!consoleCan(await getConsolePermissions(), Permission.GymManage)) {
    return { ok: false, error: t('forbidden') };
  }
  const parsed = updateMobileAppSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('invalid') };
  try {
    const data = await updateMobileAppSettings(parsed.data);
    revalidatePath('/app-settings');
    return { ok: true, data };
  } catch {
    return { ok: false, error: t('saveError') };
  }
}
