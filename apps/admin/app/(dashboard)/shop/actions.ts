'use server';

import { revalidatePath } from 'next/cache';
import {
  Permission,
  adjustStockSchema,
  createProductCategorySchema,
  createProductSchema,
  roleHasPermission,
  updateProductCategorySchema,
  updateProductSchema,
  type AdjustStockInput,
  type AdminProductCategory,
  type CreateProductCategoryInput,
  type CreateProductInput,
  type DeleteProductCategoryResponse,
  type SetProductStatusResponse,
  type UpdateProductCategoryInput,
  type UpdateProductInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  adjustProductStock,
  createProduct,
  createProductCategory,
  createUpload,
  deactivateProduct,
  deleteProductCategory,
  reactivateProduct,
  renameProductCategory,
  updateProduct,
  type SignedUploadResponse,
} from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Re-assert a capability inside the action itself. The middleware gates the
 * `/shop` route, but a Server Action is its own POST endpoint, so re-checking
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
    // `unwrap` surfaces the API's error *code*, not its prose, so these would
    // otherwise read as "Request failed (409): CONFLICT". Matched on the code
    // rather than the status: a missing *product* has its own code above, so
    // a bare NOT_FOUND reaching here is the category the write named.
    if (error.message === 'CONFLICT') {
      return 'A category with that name already exists.';
    }
    if (error.message === 'NOT_FOUND') {
      return 'That category no longer exists — refresh the page.';
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
    revalidatePath('/shop');
    return { ok: true, data: { id: product.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

// ── Categories ────────────────────────────────────────────────────────────────

/**
 * Create a category shelf. Enforces `ProductWrite` and re-validates with the API's
 * own schema; a name already in use comes back as the `409` message, which the
 * manager renders inline rather than treating as a failure of the form.
 */
export async function createProductCategoryAction(
  input: CreateProductCategoryInput,
): Promise<ActionResult<AdminProductCategory>> {
  if (!(await requireProductWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = createProductCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid category name' };
  }
  try {
    const category = await createProductCategory(parsed.data);
    revalidatePath('/shop');
    return { ok: true, data: category };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Rename a category. Every product on the shelf follows, so only the roster needs
 * refreshing — the products themselves are untouched.
 */
export async function renameProductCategoryAction(
  id: string,
  input: UpdateProductCategoryInput,
): Promise<ActionResult<AdminProductCategory>> {
  if (!(await requireProductWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = updateProductCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid category name' };
  }
  try {
    const category = await renameProductCategory(id, parsed.data);
    revalidatePath('/shop');
    return { ok: true, data: category };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Delete a category. Its products are **not** deleted — they fall back to
 * uncategorised — and `unshelved` reports how many did, so the manager can confirm
 * the blast radius it warned about.
 */
export async function deleteProductCategoryAction(
  id: string,
): Promise<ActionResult<DeleteProductCategoryResponse>> {
  if (!(await requireProductWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const result = await deleteProductCategory(id);
    revalidatePath('/shop');
    return { ok: true, data: result };
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
    revalidatePath('/shop');
    revalidatePath(`/shop/${id}`);
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
    revalidatePath('/shop');
    revalidatePath(`/shop/${id}`);
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

/** The on-hand count rules a stock adjustment must satisfy — the canonical variant `stock` shape. */

/**
 * Move one stock position from the inventory / low-stock view, and record why.
 *
 * This used to read the whole product and write it back with one number changed,
 * which lost updates whenever two people worked the shelf at once — each sent the
 * count it had read before the other's change landed. It now posts to
 * `POST /admin/products/:id/stock`, which applies the change inside a transaction
 * against the live count and appends a ledger row, so concurrent restocks compose
 * and every movement has a reason attached.
 *
 * `variantIndex` is the position — `null` for a product sold with no variants.
 * The change is either a signed `delta` or an absolute `setTo`; the server derives
 * the delta for the latter, so a recount cannot be computed against a stale
 * figure. Enforces `ProductWrite` as defence in depth behind the route middleware
 * and the API guard, and refreshes every surface that shows the number.
 */
export async function adjustStockAction(
  productId: string,
  input: AdjustStockInput,
): Promise<ActionResult<{ stock: number }>> {
  if (!(await requireProductWrite())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = adjustStockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid stock change' };
  }
  try {
    const result = await adjustProductStock(productId, parsed.data);
    revalidatePath('/shop');
    revalidatePath('/shop/inventory');
    revalidatePath('/shop/low-stock');
    revalidatePath(`/shop/${productId}`);
    return { ok: true, data: { stock: result.stock } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
