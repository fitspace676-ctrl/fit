'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  Permission,
  createTrainerSchema,
  roleHasPermission,
  setTrainerAvailabilitySchema,
  updateTrainerSchema,
  type CreateTrainerInput,
  type SetTrainerAvailabilityInput,
  type SetTrainerStatusResponse,
  type UpdateTrainerInput,
  type WeeklyAvailability,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  createTrainer,
  createUpload,
  deactivateTrainer,
  reactivateTrainer,
  setTrainerAvailability,
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

type T = Awaited<ReturnType<typeof getTranslations>>;

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown, t: T): string {
  if (error instanceof ApiError) {
    if (error.message === 'TRAINER_NOT_FOUND') {
      return t('errors.trainerNotFound');
    }
    if (error.status === 503) {
      return t('errors.photoStorage');
    }
    return t('errors.requestFailed', { status: error.status, message: error.message });
  }
  return error instanceof Error ? error.message : t('errors.unexpected');
}

/**
 * Create a trainer. Re-validates the body with the same Zod schema the API uses,
 * enforces `TrainerWrite`, then refreshes the roster cache. Returns the new
 * trainer's `id` so the form can navigate to its detail page.
 */
export async function createTrainerAction(
  input: CreateTrainerInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.trainers');
  if (!(await requireTrainerWrite())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = createTrainerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    const trainer = await createTrainer(parsed.data);
    revalidatePath('/trainers');
    return { ok: true, data: { id: trainer.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
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
  const t = await getTranslations('admin.trainers');
  if (!(await requireTrainerWrite())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = updateTrainerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidDetails') };
  }
  try {
    await updateTrainer(id, parsed.data);
    revalidatePath('/trainers');
    revalidatePath(`/trainers/${id}`);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
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
  const t = await getTranslations('admin.trainers');
  if (!(await requireTrainerWrite())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  try {
    const trainer = active ? await reactivateTrainer(id) : await deactivateTrainer(id);
    revalidatePath('/trainers');
    revalidatePath(`/trainers/${id}`);
    return { ok: true, data: { status: trainer.status } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Replace a trainer's weekly recurring availability (T5.11). Enforces
 * `TrainerWrite` and re-validates the whole week with the same Zod schema the API
 * uses, so an overlapping or backwards window is caught before the round-trip and
 * reported against the offending day rather than as a bare `400`. Returns the
 * stored, canonicalised week (unavailable days cleared, windows sorted) so the
 * editor can adopt the server's view instead of trusting its own.
 */
export async function setTrainerAvailabilityAction(
  id: string,
  input: SetTrainerAvailabilityInput,
): Promise<ActionResult<{ availability: WeeklyAvailability }>> {
  const t = await getTranslations('admin.trainers');
  if (!(await requireTrainerWrite())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  const parsed = setTrainerAvailabilitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('errors.invalidAvailability') };
  }
  try {
    const saved = await setTrainerAvailability(id, parsed.data);
    revalidatePath(`/trainers/${id}`);
    return { ok: true, data: { availability: saved.availability } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
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
  const t = await getTranslations('admin.trainers');
  if (!(await requireTrainerWrite())) {
    return { ok: false, error: t('errors.notAuthorized') };
  }
  try {
    const signed = await createUpload({ ...input, entity: 'trainers' });
    return { ok: true, data: signed };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}
