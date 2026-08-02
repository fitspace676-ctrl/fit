'use server';

import { revalidatePath } from 'next/cache';
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
  deleteClassTemplate,
  pauseClassTemplate,
  resumeClassTemplate,
  updateClassTemplate,
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

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message === 'CLASS_TEMPLATE_NOT_FOUND') {
      return 'That class template no longer exists.';
    }
    return `Request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/**
 * Create a class template. Re-validates the body with the same Zod schema the API
 * uses, enforces `ClassWrite`, then refreshes the roster cache. Returns the new
 * template's `id` so the form can navigate to its detail page.
 */
export async function createClassTemplateAction(
  input: CreateClassTemplateInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireClassWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = createClassTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid class details' };
  }
  try {
    const template = await createClassTemplate(parsed.data);
    revalidatePath('/classes');
    return { ok: true, data: { id: template.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
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
  if (!(await requireClassWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = updateClassTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid class details' };
  }
  try {
    await updateClassTemplate(id, parsed.data);
    revalidatePath('/classes');
    revalidatePath(`/classes/${id}`);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
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
  if (!(await requireClassWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    await deleteClassTemplate(id);
    revalidatePath('/classes');
    revalidatePath('/classes/schedule');
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function setClassTemplateActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ status: SetClassTemplateStatusResponse['status'] }>> {
  if (!(await requireClassWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const template = active ? await resumeClassTemplate(id) : await pauseClassTemplate(id);
    revalidatePath('/classes');
    revalidatePath(`/classes/${id}`);
    return { ok: true, data: { status: template.status } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
