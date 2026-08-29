'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
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
  uploadGymPortalImage,
  type SignedUploadResponse,
} from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * The R2 key segment the sign-in photograph is filed under — the brand logo's,
 * deliberately, not one of its own.
 *
 * `logos` is already in the API's `SWEEPABLE_ENTITIES` allow-list, and that list
 * is an allow-list on purpose: a prefix nobody taught the orphan sweep about is
 * silently *kept* forever. Filing portal images under a new `portal/` segment
 * would therefore leak every replaced photograph until someone remembered to
 * register it. Both references already live under this one prefix and both are
 * read by `MediaSweepService`, so a replaced logo and a replaced portal image are
 * collected by the same machinery and cannot delete each other's object.
 */
const PORTAL_UPLOAD_ENTITY = 'logos';

/**
 * Re-assert `GymManage` inside the action itself. `middleware.ts` gates the
 * `/member-portal` route and the API re-checks behind its own guard, but a Server
 * Action is its own POST endpoint reachable without ever loading the page — so it
 * carries the same check the Settings actions do.
 */
async function requireGymManage(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.GymManage);
}

/** Map a thrown API error to a short, translated, staff-facing message. */
async function toMessage(error: unknown): Promise<string> {
  const t = await getTranslations('admin.memberPortal.errors');
  if (error instanceof ApiError) {
    if (error.message === 'GYM_NOT_FOUND') {
      return t('gymNotFound');
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
  const t = await getTranslations('admin.memberPortal.errors');
  return { ok: false, error: t('notAuthorized') };
}

/**
 * Save the member portal's own look — `PATCH /gyms/settings` under `memberPortal`.
 *
 * Re-validated with the same Zod schema the API parses the body with, so a colour
 * this console would accept and the server would not cannot exist. Returns the full
 * updated settings so the form resyncs to the server's truth (which is also how a
 * `null` colour comes back as `null` rather than as whatever the field held).
 *
 * Both pages are revalidated: the portal's colours are read on this screen, and
 * Settings renders the brand colours these fall back to.
 */
export async function updateMemberPortalAction(
  input: NonNullable<UpdateGymSettingsInput['memberPortal']>,
): Promise<ActionResult<GymSettings>> {
  if (!(await requireGymManage())) {
    return notAuthorized();
  }
  const parsed = updateGymSettingsSchema.safeParse({ memberPortal: input });
  if (!parsed.success) {
    const t = await getTranslations('admin.memberPortal.errors');
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('invalid') };
  }
  try {
    const settings = await updateGymSettings(parsed.data);
    revalidatePath('/member-portal');
    revalidatePath('/settings');
    return { ok: true, data: settings };
  } catch (error) {
    return { ok: false, error: await toMessage(error) };
  }
}

/**
 * Mint a presigned R2 upload URL for the sign-in photograph. The form calls this,
 * then `PUT`s the bytes straight to the returned `url` from the browser — the same
 * path the brand logo takes. The owning gym is taken from the session API-side,
 * never the request, so the object can only land under this gym's prefix.
 */
export async function requestPortalImageUploadAction(input: {
  contentType: string;
  contentLength: number;
  fileName?: string;
}): Promise<ActionResult<SignedUploadResponse>> {
  if (!(await requireGymManage())) {
    return notAuthorized();
  }
  try {
    const signed = await createUpload({ ...input, entity: PORTAL_UPLOAD_ENTITY });
    return { ok: true, data: signed };
  } catch (error) {
    return { ok: false, error: await toMessage(error) };
  }
}

/**
 * Finalise a sign-in photograph: hand the uploaded object's `photoKey` to the API,
 * which checks the key belongs to this gym, persists its public URL as the portal's
 * `loginImageUrl`, and returns that URL.
 *
 * The URL is then written into the form as well, marked dirty — exactly as the logo
 * uploader does — so the next Save keeps it and the preview repaints immediately.
 */
export async function finalizePortalImageAction(
  photoKey: string,
): Promise<ActionResult<{ loginImageUrl: string }>> {
  if (!(await requireGymManage())) {
    return notAuthorized();
  }
  try {
    const result = await uploadGymPortalImage({ photoKey });
    revalidatePath('/member-portal');
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: await toMessage(error) };
  }
}
