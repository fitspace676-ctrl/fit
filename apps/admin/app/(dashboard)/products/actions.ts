'use server';

import { revalidatePath } from 'next/cache';
import {
  Permission,
  createProductSchema,
  roleHasPermission,
  updateProductSchema,
  type CreateProductInput,
  type SetProductStatusResponse,
  type UpdateProductInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  createProduct,
  createUpload,
  deactivateProduct,
  reactivateProduct,
  updateProduct,
  type SignedUploadResponse,
} from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Re-assert a capability inside the action itself. The middleware gates the
 * `/products` route, but a Server Action is its own POST endpoint, so re-checking
 * here is defence in depth (the API re-checks again behind its guards).
 */
async function sessionHas(permission: Permission): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, permission);
}

const requireProductWrite = () => sessionHas(Permission.ProductWrite);

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message === 'PRODUCT_NOT_FOUND') {
      return 'That product no longer exists.';
    }
    if (error.status === 503) {
      return 'Image storage is not configured. Save the product without images, or try again later.';
    }
    return `Request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/**
 * Create a product. Re-validates the body with the same Zod schema the API uses,
 * enforces `ProductWrite`, then refreshes the roster cache. Returns the new
 * product's `id` so the form can navigate to its detail page.
 */
export async function createProductAction(
  input: CreateProductInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireProductWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid product details' };
  }
  try {
    const product = await createProduct(parsed.data);
    revalidatePath('/products');
    return { ok: true, data: { id: product.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Edit a product's profile. Enforces `ProductWrite`, re-validates the body, and
 * refreshes both the roster and the product's detail page on success.
 */
export async function updateProductAction(
  id: string,
  input: UpdateProductInput,
): Promise<ActionResult<{ id: string }>> {
  if (!(await requireProductWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid product details' };
  }
  try {
    await updateProduct(id, parsed.data);
    revalidatePath('/products');
    revalidatePath(`/products/${id}`);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Deactivate (`INACTIVE`) or reactivate (`ACTIVE`) a product. One action behind a
 * boolean keeps the two mirror-image transitions in a single place; both enforce
 * `ProductWrite` and refresh the roster + detail caches.
 */
export async function setProductActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ status: SetProductStatusResponse['status'] }>> {
  if (!(await requireProductWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const product = active ? await reactivateProduct(id) : await deactivateProduct(id);
    revalidatePath('/products');
    revalidatePath(`/products/${id}`);
    return { ok: true, data: { status: product.status } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Mint a presigned R2 upload URL for a product gallery image. The form calls this
 * once per chosen file, then `PUT`s the bytes straight to the returned `url` from
 * the browser and appends the `publicUrl` to the product's `images`. Enforces
 * `ProductWrite`; the owning gym is taken from the session API-side, never the
 * request.
 */
export async function requestProductImageUploadAction(input: {
  contentType: string;
  contentLength: number;
  fileName?: string;
}): Promise<ActionResult<SignedUploadResponse>> {
  if (!(await requireProductWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const signed = await createUpload({ ...input, entity: 'products' });
    return { ok: true, data: signed };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
