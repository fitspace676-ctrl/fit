'use server';

import { getTranslations } from 'next-intl/server';
import {
  Permission,
  createClassTypeSchema,
  roleHasPermission,
  updateClassTypeSchema,
  type CreateClassTypeInput,
  type UpdateClassTypeInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  activateClassType,
  createClassType,
  deactivateClassType,
  fetchClassType,
  updateClassType,
} from '@/lib/api';
import type { ActionResult } from './actions';
import type { ClassTypeInitial } from './class-type-form';

/** Re-assert `ClassWrite` inside the action (defence in depth; the API re-checks). */
async function requireClassWrite(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.ClassWrite);
}

type ErrorT = Awaited<ReturnType<typeof getTranslations>>;

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown, t: ErrorT): string {
  if (error instanceof ApiError) {
    if (error.message === 'CLASS_TYPE_NOT_FOUND') {
      return t('classTypeNotFound');
    }
    return t('requestFailed', { status: error.status, message: error.message });
  }
  return error instanceof Error ? error.message : t('unexpected');
}

/**
 * Load one class type's editable profile for the edit drawer. Enforces
 * `ClassWrite` (the drawer only opens for writers) and reshapes the detail
 * (`GET /admin/class-types/:id`, which carries the description the roster row
 * omits) into the form's initial values.
 */
export async function getClassTypeAction(id: string): Promise<ActionResult<ClassTypeInitial>> {
  const t = await getTranslations('admin.classes.errors');
  if (!(await requireClassWrite())) {
    return { ok: false, error: t('notAuthorized') };
  }
  try {
    const type = await fetchClassType(id);
    return {
      ok: true,
      data: {
        name: type.name,
        description: type.description,
        durationMinutes: type.durationMinutes,
        capacity: type.capacity,
        minAttendance: type.minAttendance,
        color: type.color,
        pricingRule: type.pricingRule,
        priceMinor: type.priceMinor,
        includedPlanIds: type.includedPlanIds,
        status: type.status,
        locationId: type.locationId,
      },
    };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Create a class type. Re-validates with the same Zod schema the API uses,
 * enforces `ClassWrite`, then refreshes the roster. Returns the new type's id.
 */
export async function createClassTypeAction(
  input: CreateClassTypeInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.classes.errors');
  if (!(await requireClassWrite())) {
    return { ok: false, error: t('notAuthorized') };
  }
  const parsed = createClassTypeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('invalidClassTypeDetails') };
  }
  try {
    const type = await createClassType(parsed.data);
    return { ok: true, data: { id: type.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Edit a class type's profile. Enforces `ClassWrite` and re-validates the body. */
export async function updateClassTypeAction(
  id: string,
  input: UpdateClassTypeInput,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.classes.errors');
  if (!(await requireClassWrite())) {
    return { ok: false, error: t('notAuthorized') };
  }
  const parsed = updateClassTypeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('invalidClassTypeDetails') };
  }
  try {
    await updateClassType(id, parsed.data);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/** Activate (`ACTIVE`) or deactivate (`INACTIVE`) a class type. */
export async function setClassTypeActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('admin.classes.errors');
  if (!(await requireClassWrite())) {
    return { ok: false, error: t('notAuthorized') };
  }
  try {
    await (active ? activateClassType(id) : deactivateClassType(id));
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}
