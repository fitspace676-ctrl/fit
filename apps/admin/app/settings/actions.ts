'use server';

import { revalidatePath } from 'next/cache';
import {
  Permission,
  roleHasPermission,
  updateGymSettingsSchema,
  type GymSettings,
  type UpdateGymSettingsInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  createUpload,
  updateGymSettings,
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

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message === 'GYM_NOT_FOUND') {
      return 'This gym no longer exists.';
    }
    if (error.status === 403) {
      return 'You do not have permission to change gym settings.';
    }
    if (error.status === 503) {
      return 'Image storage is not configured. Save your other changes, or try the logo again later.';
    }
    return `Request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
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
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = updateGymSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid settings' };
  }
  try {
    const settings = await updateGymSettings(parsed.data);
    revalidatePath('/settings');
    return { ok: true, data: settings };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
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
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const signed = await createUpload({ ...input, entity: 'logos' });
    return { ok: true, data: signed };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Finalise a logo upload: hand the uploaded object's `photoKey` to the API, which
 * persists its public URL as the brand logo and returns that URL. Enforces
 * `GymManage` and refreshes the settings page.
 */
export async function finalizeGymLogoAction(
  photoKey: string,
): Promise<ActionResult<{ logoUrl: string }>> {
  if (!(await requireGymManage())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const result = await uploadGymLogo({ photoKey });
    revalidatePath('/settings');
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
