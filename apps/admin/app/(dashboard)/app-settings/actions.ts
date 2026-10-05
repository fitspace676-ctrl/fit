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
import {
  ApiError,
  clearMobileAppLoginImage,
  createUpload,
  updateMobileAppSettings,
  uploadMobileAppLoginImage,
  type SignedUploadResponse,
} from '@/lib/api';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * The member portal's upload prefix, on purpose: `logos` is in the API's
 * `SWEEPABLE_ENTITIES` allow-list, and both media services know this reference.
 */
const APP_LOGIN_IMAGE_ENTITY = 'logos';

/** Re-asserted inside every action: a Server Action is its own POST endpoint. */
async function canManage(): Promise<boolean> {
  return consoleCan(await getConsolePermissions(), Permission.GymManage);
}

async function photoError(error: unknown): Promise<string> {
  const t = await getTranslations('admin.appSettings.loginImage');
  if (error instanceof ApiError) {
    if (error.status === 403) return t('notEnabled');
    if (error.status === 503) return t('storageUnavailable');
  }
  return t('saveError');
}

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

/** Mint a presigned R2 URL for the app's sign-in photo; the browser `PUT`s to it. */
export async function requestAppLoginImageUploadAction(input: {
  contentType: string;
  contentLength: number;
  fileName?: string;
}): Promise<Result<SignedUploadResponse>> {
  const t = await getTranslations('admin.appSettings');
  if (!(await canManage())) return { ok: false, error: t('forbidden') };
  try {
    return { ok: true, data: await createUpload({ ...input, entity: APP_LOGIN_IMAGE_ENTITY }) };
  } catch (error) {
    return { ok: false, error: await photoError(error) };
  }
}

/** Store the uploaded key as the app's own sign-in photo (saved immediately). */
export async function finalizeAppLoginImageAction(
  photoKey: string,
): Promise<Result<MobileAppSettings>> {
  const t = await getTranslations('admin.appSettings');
  if (!(await canManage())) return { ok: false, error: t('forbidden') };
  try {
    const data = await uploadMobileAppLoginImage({ photoKey });
    revalidatePath('/app-settings');
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: await photoError(error) };
  }
}

/** Drop the app's own photo; the app falls back to the member portal's. */
export async function clearAppLoginImageAction(): Promise<Result<MobileAppSettings>> {
  const t = await getTranslations('admin.appSettings');
  if (!(await canManage())) return { ok: false, error: t('forbidden') };
  try {
    const data = await clearMobileAppLoginImage();
    revalidatePath('/app-settings');
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: await photoError(error) };
  }
}
