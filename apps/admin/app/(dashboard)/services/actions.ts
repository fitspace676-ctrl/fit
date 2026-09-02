'use server';

import { revalidatePath } from 'next/cache';
import {
  Permission,
  createServiceCategorySchema,
  createServiceSchema,
  roleHasPermission,
  updateServiceSchema,
  type CreateServiceCategoryInput,
  type CreateServiceInput,
  type ServiceCategory,
  type ServiceStaffOption,
  type UpdateServiceData,
} from '@fit/types';
import {
  ApiError,
  archiveService,
  createService,
  createServiceCategory,
  createUpload,
  deleteService,
  deleteServiceCategory,
  fetchServiceCategories,
  fetchServiceStaff,
  restoreService,
  updateService,
  type SignedUploadResponse,
} from '@/lib/api';
import { getServerSession } from '@/lib/session';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function sessionHas(permission: Permission): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, permission);
}

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.message) {
      case 'SERVICE_NOT_FOUND':
        return 'That service no longer exists - refresh the page.';
      case 'SERVICE_STAFF_INVALID':
        return 'Pick a staff member of this gym.';
      case 'SERVICE_STAFF_NOT_TRAINER':
        return 'A personal-training service needs a staff member with a trainer profile.';
      case 'SERVICE_CATEGORY_INVALID':
        return "Pick one of this gym's categories.";
      case 'SERVICE_CATEGORY_EXISTS':
        return 'A category with that name already exists.';
      case 'SERVICE_CATEGORY_IN_USE':
        return 'Move its services to another category before deleting it.';
      case 'SERVICE_CATEGORY_NOT_FOUND':
        return 'That category no longer exists - refresh the page.';
      case 'SERVICE_NOT_ARCHIVED':
        return 'Archive the service before deleting it.';
      case 'SERVICE_HAS_SESSIONS':
        return 'This service has booked or completed sessions and cannot be deleted.';
      default:
        return `Request failed (${error.status}): ${error.message}`;
    }
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

export async function createServiceAction(
  input: CreateServiceInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await sessionHas(Permission.ProductWrite))) return { ok: false, error: 'Not authorized' };
  const parsed = createServiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid service details' };
  }
  try {
    const service = await createService(parsed.data);
    revalidatePath('/services');
    return { ok: true, data: { id: service.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function updateServiceAction(
  id: string,
  input: UpdateServiceData,
): Promise<ActionResult> {
  if (!(await sessionHas(Permission.ProductWrite))) return { ok: false, error: 'Not authorized' };
  const parsed = updateServiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid service details' };
  }
  try {
    await updateService(id, parsed.data);
    revalidatePath('/services');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function archiveServiceAction(id: string): Promise<ActionResult> {
  if (!(await sessionHas(Permission.ProductWrite))) return { ok: false, error: 'Not authorized' };
  try {
    await archiveService(id);
    revalidatePath('/services');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function restoreServiceAction(id: string): Promise<ActionResult> {
  if (!(await sessionHas(Permission.ProductWrite))) return { ok: false, error: 'Not authorized' };
  try {
    await restoreService(id);
    revalidatePath('/services');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function deleteServiceAction(id: string): Promise<ActionResult> {
  if (!(await sessionHas(Permission.ProductWrite))) return { ok: false, error: 'Not authorized' };
  try {
    await deleteService(id);
    revalidatePath('/services');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Mint a presigned R2 `PUT` URL for a service cover image (`{gymId}/services/…`).
 * Same flow as the class cover: the browser sends the bytes straight to R2 and
 * only the resulting public URL is persisted on the service.
 */
export async function requestServiceCoverUploadAction(input: {
  contentType: string;
  contentLength: number;
  fileName?: string;
}): Promise<ActionResult<SignedUploadResponse>> {
  if (!(await sessionHas(Permission.ProductWrite))) return { ok: false, error: 'Not authorized' };
  try {
    return { ok: true, data: await createUpload({ ...input, entity: 'services' }) };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/** The staff picker's options, fetched by the drawer when it opens. */
export async function fetchServiceStaffAction(): Promise<ActionResult<ServiceStaffOption[]>> {
  if (!(await sessionHas(Permission.ProductRead))) return { ok: false, error: 'Not authorized' };
  try {
    return { ok: true, data: (await fetchServiceStaff()).data };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/** The gym's categories, for the form's picker and the drawer's category panel. */
export async function fetchServiceCategoriesAction(): Promise<ActionResult<ServiceCategory[]>> {
  if (!(await sessionHas(Permission.ProductRead))) return { ok: false, error: 'Not authorized' };
  try {
    return { ok: true, data: (await fetchServiceCategories()).data };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function createServiceCategoryAction(
  input: CreateServiceCategoryInput,
): Promise<ActionResult<ServiceCategory>> {
  if (!(await sessionHas(Permission.ProductWrite))) return { ok: false, error: 'Not authorized' };
  const parsed = createServiceCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid category' };
  }
  try {
    const category = await createServiceCategory(parsed.data);
    revalidatePath('/services');
    return { ok: true, data: category };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function deleteServiceCategoryAction(id: string): Promise<ActionResult> {
  if (!(await sessionHas(Permission.ProductWrite))) return { ok: false, error: 'Not authorized' };
  try {
    await deleteServiceCategory(id);
    revalidatePath('/services');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
