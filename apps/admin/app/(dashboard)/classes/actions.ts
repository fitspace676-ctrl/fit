'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  Permission,
  createClassTemplateSchema,
  roleHasPermission,
  updateClassTemplateSchema,
  type CreateClassTemplateInput,
  type SetClassTemplateStatusResponse,
  type UpdateClassTemplateInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  createClassTemplate,
  createUpload,
  deleteClassTemplate,
  pauseClassTemplate,
  resumeClassTemplate,
  updateClassTemplate,
  type SignedUploadResponse,
} from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Re-assert a capability inside the action itself. The middleware gates the
 * `/classes` route, but a Server Action is its own POST endpoint, so re-checking
 * here is defence in depth (the API re-checks again behind its guards).
 */
async function sessionHas(permission: Permission): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, permission);
}

const requireClassWrite = () => sessionHas(Permission.ClassWrite);

type ErrorT = Awaited<ReturnType<typeof getTranslations>>;

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown, t: ErrorT): string {
  if (error instanceof ApiError) {
    if (error.message === 'CLASS_TEMPLATE_NOT_FOUND') {
      return t('classTemplateNotFound');
    }
    return t('requestFailed', { status: error.status, message: error.message });
  }
  return error instanceof Error ? error.message : t('unexpected');
}

/**
 * Mint a presigned R2 `PUT` URL for a class cover image (`{gymId}/classes/…`).
 * Mirrors the product-gallery uploader: the browser sends the bytes straight to
 * R2 and only the resulting public URL is ever persisted on the template.
 */
export async function requestClassImageUploadAction(input: {
  contentType: string;
  contentLength: number;
  fileName?: string;
}): Promise<ActionResult<SignedUploadResponse>> {
  const t = await getTranslations('admin.classes.errors');
  if (!(await requireClassWrite())) {
    return { ok: false, error: t('notAuthorized') };
  }
  try {
    const signed = await createUpload({ ...input, entity: 'classes' });
    return { ok: true, data: signed };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Create a class template. Re-validates the body with the same Zod schema the API
 * uses, enforces `ClassWrite`, then refreshes the roster cache. Returns the new
 * template's `id` so the form can navigate to its detail page.
 */
export async function createClassTemplateAction(
  input: CreateClassTemplateInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.classes.errors');
  if (!(await requireClassWrite())) {
    return { ok: false, error: t('notAuthorized') };
  }
  const parsed = createClassTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('invalidClassDetails') };
  }
  try {
    const template = await createClassTemplate(parsed.data);
    revalidatePath('/classes');
    return { ok: true, data: { id: template.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Edit a class template's profile. Enforces `ClassWrite`, re-validates the body,
 * and refreshes both the roster and the template's detail page on success.
 */
export async function updateClassTemplateAction(
  id: string,
  input: UpdateClassTemplateInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.classes.errors');
  if (!(await requireClassWrite())) {
    return { ok: false, error: t('notAuthorized') };
  }
  const parsed = updateClassTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('invalidClassDetails') };
  }
  try {
    await updateClassTemplate(id, parsed.data);
    revalidatePath('/classes');
    revalidatePath(`/classes/${id}`);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Pause (`PAUSED`) or resume (`ACTIVE`) a class template. One action behind a
 * boolean keeps the two mirror-image transitions in a single place; both enforce
 * `ClassWrite` and refresh the roster + detail caches.
 */
/**
 * Delete a class template. The API keeps the gym's history — past occurrences and
 * booked future ones are detached rather than cascaded away — so this removes the
 * rule, not the record of the classes it ran.
 */
export async function deleteClassTemplateAction(id: string): Promise<ActionResult<null>> {
  const t = await getTranslations('admin.classes.errors');
  if (!(await requireClassWrite())) {
    return { ok: false, error: t('notAuthorized') };
  }
  try {
    await deleteClassTemplate(id);
    revalidatePath('/classes');
    revalidatePath('/classes/schedule');
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

export async function setClassTemplateActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ status: SetClassTemplateStatusResponse['status'] }>> {
  const t = await getTranslations('admin.classes.errors');
  if (!(await requireClassWrite())) {
    return { ok: false, error: t('notAuthorized') };
  }
  try {
    const template = active ? await resumeClassTemplate(id) : await pauseClassTemplate(id);
    revalidatePath('/classes');
    revalidatePath(`/classes/${id}`);
    return { ok: true, data: { status: template.status } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}
