'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  Permission,
  roleHasPermission,
  updateGymSettingsSchema,
  updateLocationSchema,
  type GymSettings,
  type UpdateGymSettingsInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  createUpload,
  fetchLocation,
  updateGymSettings,
  updateLocation,
  uploadGymLogo,
  type SignedUploadResponse,
} from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Re-assert a capability inside the action itself. The middleware gates the
 * `/settings` route, but a Server Action is its own POST endpoint, so re-checking
 * here is defence in depth (the API re-checks again behind its `GymManage` guard).
 */
async function sessionHas(permission: Permission): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, permission);
}

const requireGymManage = () => sessionHas(Permission.GymManage);

const requireLocationWrite = () => sessionHas(Permission.LocationWrite);

/** Map a thrown API error to a short, translated, staff-facing message. */
async function toMessage(error: unknown): Promise<string> {
  const t = await getTranslations('admin.settings.errors');
  if (error instanceof ApiError) {
    if (error.message === 'GYM_NOT_FOUND') {
      return t('gymNotFound');
    }
    if (error.message === 'LOCATION_NOT_FOUND' || error.status === 404) {
      return t('locationNotFound');
    }
    if (error.status === 403) {
      return t('forbidden');
    }
    if (error.status === 503) {
      return t('storageUnavailable');
    }
    return t('requestFailed', { status: error.status, message: error.message });
  }
  return error instanceof Error ? error.message : t('unexpected');
}

/** The translated "not authorized" message, shared by every action's session gate. */
async function notAuthorized(): Promise<{ ok: false; error: string }> {
  const t = await getTranslations('admin.settings.errors');
  return { ok: false, error: t('notAuthorized') };
}

/**
 * Save a partial settings update. Re-validates the body with the same Zod schema
 * the API uses, enforces `GymManage`, then refreshes the settings page. Returns
 * the full updated settings so the form can resync to the server's truth.
 */
export async function updateGymSettingsAction(
  input: UpdateGymSettingsInput,
): Promise<ActionResult<GymSettings>> {
  if (!(await requireGymManage())) {
    return notAuthorized();
  }
  const parsed = updateGymSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const t = await getTranslations('admin.settings.errors');
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('invalid') };
  }
  try {
    const settings = await updateGymSettings(parsed.data);
    revalidatePath('/settings');
    return { ok: true, data: settings };
  } catch (error) {
    return { ok: false, error: await toMessage(error) };
  }
}

/**
 * Mint a presigned R2 upload URL for the gym logo. The form calls this, then
 * `PUT`s the bytes straight to the returned `url` from the browser. Enforces
 * `GymManage`; the owning gym is taken from the session API-side, never the
 * request, and the object lands under the gym's `logos/` prefix.
 */
export async function requestLogoUploadAction(input: {
  contentType: string;
  contentLength: number;
  fileName?: string;
}): Promise<ActionResult<SignedUploadResponse>> {
  if (!(await requireGymManage())) {
    return notAuthorized();
  }
  try {
    const signed = await createUpload({ ...input, entity: 'logos' });
    return { ok: true, data: signed };
  } catch (error) {
    return { ok: false, error: await toMessage(error) };
  }
}

/**
 * Finalise a logo upload: hand the uploaded object's `photoKey` to the API, which
 * persists its public URL as the brand logo and returns that URL. Enforces
 * `GymManage` and refreshes the settings page.
 */
/**
 * Rename one location from the Settings › Locations card. `PATCH /admin/locations/:id`
 * is a whole-profile replace, not a merge, so this re-reads the location and sends
 * its current address / phone / photo / amenities / hours back untouched with only
 * the new `name` — renaming from here can never blank the rest of the branch.
 * Enforces `LocationWrite`, then refreshes both the settings page and the locations
 * roster so every surface shows the new name.
 */
export async function renameLocationAction(
  id: string,
  name: string,
): Promise<ActionResult<{ id: string; name: string }>> {
  if (!(await requireLocationWrite())) {
    return notAuthorized();
  }
  try {
    const current = await fetchLocation(id);
    const parsed = updateLocationSchema.safeParse({
      name,
      address: current.address,
      phone: current.phone,
      photoUrl: current.photoUrl,
      amenities: current.amenities,
      hours: current.hours,
    });
    if (!parsed.success) {
      const t = await getTranslations('admin.settings.errors');
      return { ok: false, error: parsed.error.issues[0]?.message ?? t('invalid') };
    }
    const updated = await updateLocation(id, parsed.data);
    revalidatePath('/settings');
    revalidatePath('/locations');
    revalidatePath(`/locations/${id}`);
    return { ok: true, data: { id: updated.id, name: updated.name } };
  } catch (error) {
    return { ok: false, error: await toMessage(error) };
  }
}

export async function finalizeGymLogoAction(
  photoKey: string,
): Promise<ActionResult<{ logoUrl: string }>> {
  if (!(await requireGymManage())) {
    return notAuthorized();
  }
  try {
    const result = await uploadGymLogo({ photoKey });
    revalidatePath('/settings');
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: await toMessage(error) };
  }
}
