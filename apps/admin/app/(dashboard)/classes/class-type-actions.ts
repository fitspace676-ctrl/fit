'use server';

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

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message === 'CLASS_TYPE_NOT_FOUND') {
      return 'That class type no longer exists.';
    }
    return `Request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/**
 * Load one class type's editable profile for the edit drawer. Enforces
 * `ClassWrite` (the drawer only opens for writers) and reshapes the detail
 * (`GET /admin/class-types/:id`, which carries the description the roster row
 * omits) into the form's initial values.
 */
export async function getClassTypeAction(
  id: string,
): Promise<ActionResult<ClassTypeInitial>> {
  if (!(await requireClassWrite())) {
    return { ok: false, error: 'Not authorized' };
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
      },
    };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Create a class type. Re-validates with the same Zod schema the API uses,
 * enforces `ClassWrite`, then refreshes the roster. Returns the new type's id.
 */
export async function createClassTypeAction(
  input: CreateClassTypeInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireClassWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = createClassTypeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid class-type details' };
  }
  try {
    const type = await createClassType(parsed.data);
    return { ok: true, data: { id: type.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/** Edit a class type's profile. Enforces `ClassWrite` and re-validates the body. */
export async function updateClassTypeAction(
  id: string,
  input: UpdateClassTypeInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireClassWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = updateClassTypeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid class-type details' };
  }
  try {
    await updateClassType(id, parsed.data);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/** Activate (`ACTIVE`) or deactivate (`INACTIVE`) a class type. */
export async function setClassTypeActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireClassWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    await (active ? activateClassType(id) : deactivateClassType(id));
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
