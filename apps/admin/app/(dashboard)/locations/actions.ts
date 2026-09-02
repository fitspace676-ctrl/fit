'use server';

import { revalidatePath } from 'next/cache';
import {
  Permission,
  createLocationSchema,
  roleHasPermission,
  updateLocationSchema,
  type CreateLocationInput,
  type SetLocationStatusResponse,
  type UpdateLocationInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  createLocation,
  createUpload,
  deactivateLocation,
  reactivateLocation,
  updateLocation,
  type SignedUploadResponse,
} from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Re-assert a capability inside the action itself. The middleware gates the
 * `/locations` route, but a Server Action is its own POST endpoint, so re-checking
 * here is defence in depth (the API re-checks again behind its guards).
 */
async function sessionHas(permission: Permission): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, permission);
}

const requireLocationWrite = () => sessionHas(Permission.LocationWrite);
const requireLocationManage = () => sessionHas(Permission.LocationManage);

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message === 'LOCATION_NOT_FOUND') {
      return 'That location no longer exists.';
    }
    if (error.status === 503) {
      return 'Photo storage is not configured. Save the location without a photo, or try again later.';
    }
    return `Request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/**
 * Create a location. Re-validates the body with the same Zod schema the API uses,
 * enforces `LocationManage`, then refreshes the roster cache. Returns the new
 * location's `id` so the form can navigate to its detail page.
 */
export async function createLocationAction(
  input: CreateLocationInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireLocationManage())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = createLocationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid location details' };
  }
  try {
    const location = await createLocation(parsed.data);
    revalidatePath('/locations');
    return { ok: true, data: { id: location.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Edit a location's profile. Enforces `LocationWrite`, re-validates the body, and
 * refreshes both the roster and the location's detail page on success.
 */
export async function updateLocationAction(
  id: string,
  input: UpdateLocationInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireLocationWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = updateLocationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid location details' };
  }
  try {
    await updateLocation(id, parsed.data);
    revalidatePath('/locations');
    revalidatePath(`/locations/${id}`);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Deactivate (`INACTIVE`) or reactivate (`ACTIVE`) a location. One action behind a
 * boolean keeps the two mirror-image transitions in a single place; both enforce
 * `LocationManage` and refresh the roster + detail caches.
 */
export async function setLocationActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ status: SetLocationStatusResponse['status'] }>> {
  if (!(await requireLocationManage())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const location = active ? await reactivateLocation(id) : await deactivateLocation(id);
    revalidatePath('/locations');
    revalidatePath(`/locations/${id}`);
    return { ok: true, data: { status: location.status } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Mint a presigned R2 upload URL for a location photo. The form calls this, then
 * `PUT`s the file bytes straight to the returned `url` from the browser and saves
 * the `publicUrl` as the location's `photoUrl`. Enforces `LocationWrite`; the
 * owning gym is taken from the session API-side, never the request.
 */
export async function requestLocationPhotoUploadAction(input: {
  contentType: string;
  contentLength: number;
  fileName?: string;
}): Promise<ActionResult<SignedUploadResponse>> {
  if (!(await requireLocationWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const signed = await createUpload({ ...input, entity: 'locations' });
    return { ok: true, data: signed };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
