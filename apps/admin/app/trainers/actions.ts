'use server';

import { revalidatePath } from 'next/cache';
import {
  Permission,
  createTrainerSchema,
  roleHasPermission,
  updateTrainerSchema,
  type CreateTrainerInput,
  type SetTrainerStatusResponse,
  type UpdateTrainerInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  createTrainer,
  createUpload,
  deactivateTrainer,
  reactivateTrainer,
  updateTrainer,
  type SignedUploadResponse,
} from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Re-assert a capability inside the action itself. The middleware gates the
 * `/trainers` route, but a Server Action is its own POST endpoint, so re-checking
 * here is defence in depth (the API re-checks again behind its guards).
 */
async function sessionHas(permission: Permission): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, permission);
}

const requireTrainerWrite = () => sessionHas(Permission.TrainerWrite);

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message === 'TRAINER_NOT_FOUND') {
      return 'That trainer no longer exists.';
    }
    if (error.status === 503) {
      return 'Photo storage is not configured. Save the trainer without a photo, or try again later.';
    }
    return `Request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/**
 * Create a trainer. Re-validates the body with the same Zod schema the API uses,
 * enforces `TrainerWrite`, then refreshes the roster cache. Returns the new
 * trainer's `id` so the form can navigate to its detail page.
 */
export async function createTrainerAction(
  input: CreateTrainerInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireTrainerWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = createTrainerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid trainer details' };
  }
  try {
    const trainer = await createTrainer(parsed.data);
    revalidatePath('/trainers');
    return { ok: true, data: { id: trainer.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Edit a trainer's profile. Enforces `TrainerWrite`, re-validates the body, and
 * refreshes both the roster and the trainer's detail page on success.
 */
export async function updateTrainerAction(
  id: string,
  input: UpdateTrainerInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireTrainerWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = updateTrainerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid trainer details' };
  }
  try {
    await updateTrainer(id, parsed.data);
    revalidatePath('/trainers');
    revalidatePath(`/trainers/${id}`);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Deactivate (`INACTIVE`) or reactivate (`ACTIVE`) a trainer. One action behind a
 * boolean keeps the two mirror-image transitions in a single place; both enforce
 * `TrainerWrite` and refresh the roster + detail caches.
 */
export async function setTrainerActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ status: SetTrainerStatusResponse['status'] }>> {
  if (!(await requireTrainerWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const trainer = active ? await reactivateTrainer(id) : await deactivateTrainer(id);
    revalidatePath('/trainers');
    revalidatePath(`/trainers/${id}`);
    return { ok: true, data: { status: trainer.status } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Mint a presigned R2 upload URL for a trainer photo. The form calls this, then
 * `PUT`s the file bytes straight to the returned `url` from the browser and saves
 * the `publicUrl` as the trainer's `photoUrl`. Enforces `TrainerWrite`; the
 * owning gym is taken from the session API-side, never the request.
 */
export async function requestTrainerPhotoUploadAction(input: {
  contentType: string;
  contentLength: number;
  fileName?: string;
}): Promise<ActionResult<SignedUploadResponse>> {
  if (!(await requireTrainerWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const signed = await createUpload({ ...input, entity: 'trainers' });
    return { ok: true, data: signed };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
