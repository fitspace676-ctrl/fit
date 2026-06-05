// @fit/types — product admin contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the staff console's product management
// (T4.6): the paginated `GET /admin/products` roster the admin table renders, the
// `GET /admin/products/:id` detail view, and the create / edit / deactivate writes.
// The API validates inbound queries/bodies with these Zod schemas and the
// `@fit/admin` console reuses the inferred types, so the table / form and the
// controller can never drift on the wire format.
//
// A product is a gym-curated retail item with a base price, an ordered image
// gallery, and a set of purchasable variants. Price is carried in the currency's
// MINOR units (cents/tetri) as an integer, so no float rounding crosses the wire;
// the client formats it with `Intl.NumberFormat` against `currency` (ISO 4217).
// The image gallery and the variants mirror the Location model's `amenities`
// (a flat list) and `hours` (a structured JSON value validated up front) — both
// are edited as a whole on the product form and round-trip through the API.

import { z } from 'zod';
import { sortDirSchema } from './members';

/**
 * A product's lifecycle within the gym, mirroring the Prisma `ProductStatus`
 * enum. `ACTIVE` is a product the gym currently sells; `INACTIVE` is
 * soft-deactivated — hidden but retained (T4.6). The roster filter and the status
 * badge both key off this.
 */
export const productStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

/** A product's lifecycle state — {@link productStatusSchema}. */
export type ProductStatus = z.infer<typeof productStatusSchema>;

/** Sortable columns for the product roster. Mirrors the `orderBy` keys the service maps. */
export const productSortSchema = z.enum(['name', 'price', 'status', 'createdAt']);

/** A column the product roster may be sorted by — {@link productSortSchema}. */
export type ProductSort = z.infer<typeof productSortSchema>;

/** The most images a single product's gallery may hold (keeps the form + roster sane). */
export const MAX_PRODUCT_IMAGES = 12;

/** The most variants a single product may carry. */
export const MAX_PRODUCT_VARIANTS = 50;

/**
 * One purchasable variant of a product (e.g. a size / colour / flavour). `name` is
 * the human label shown on the option. `sku` is the optional stock-keeping code
 * (empty string when unset). `priceAmount` overrides the product's base price for
 * this variant when set (minor units); `null` means "inherit the base price". `stock`
 * is the on-hand quantity (0 when out of stock / untracked). Numbers are coerced
 * because the admin form submits them as strings.
 */
export const productVariantSchema = z.object({
  name: z.string().trim().min(1, 'Variant name is required').max(80),
  sku: z
    .string()
    .trim()
    .max(60, 'SKU must be 60 characters or fewer')
    .default('')
    .transform((value) => value.trim()),
  priceAmount: z.coerce
    .number()
    .int('Variant price must be a whole number of minor units')
    .nonnegative('Variant price cannot be negative')
    .nullable()
    .default(null),
  stock: z.coerce
    .number()
    .int('Stock must be a whole number')
    .nonnegative('Stock cannot be negative')
    .default(0),
});

/** One parsed product variant — {@link productVariantSchema}. */
export type ProductVariant = z.infer<typeof productVariantSchema>;

/**
 * A product's full variant list. Each entry defaults its optional fields, and the
 * whole list is capped so the form and the stored JSON stay bounded. The API
 * always stores and returns a (possibly empty) array, so the form never has to
 * guess the shape.
 */
export const productVariantsSchema = z
  .array(productVariantSchema)
  .max(MAX_PRODUCT_VARIANTS, `A product can have at most ${MAX_PRODUCT_VARIANTS} variants`)
  .default([]);

/** A product's parsed variants — {@link productVariantsSchema}. */
export type ProductVariants = z.infer<typeof productVariantsSchema>;

/**
 * Query for `GET /admin/products`. Pagination is mandatory server-side (`page` is
 * 1-based, `limit` capped at 100); `search` matches the product name/description,
 * `status` narrows the list, and `sort` + `dir` drive ordering. Every field is
 * optional with a sensible default so a bare `GET /admin/products` is valid.
 * Numbers are coerced because they arrive as query strings.
 */
export const listAdminProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: productStatusSchema.optional(),
  sort: productSortSchema.default('name'),
  dir: sortDirSchema.default('asc'),
});

/** Validated `GET /admin/products` query — {@link listAdminProductsQuerySchema}. */
export type ListAdminProductsQuery = z.infer<typeof listAdminProductsQuerySchema>;

/**
 * One product as the roster table renders it. `imageUrl` is the primary (first)
 * gallery image, or `null` when the product has no images (the table renders a
 * placeholder). `priceAmount` is the base price in `currency`'s minor units the
 * table formats. `variantCount` is the size of the variant list so the roster can
 * show "3 variants" without shipping the whole list. `createdAt` is an ISO-8601
 * instant the table formats in the staff member's local zone.
 */
export interface AdminProductRow {
  id: string;
  name: string;
  priceAmount: number;
  currency: string;
  imageUrl: string | null;
  variantCount: number;
  status: ProductStatus;
  createdAt: string;
}

/**
 * Successful `GET /admin/products` response — one page of the roster plus the
 * totals the pager needs. `total` is the count *after* filters, `page` / `limit`
 * echo the request. An empty `data` is a normal result the table renders as its
 * empty state.
 */
export interface ListAdminProductsResponse {
  data: AdminProductRow[];
  total: number;
  page: number;
  limit: number;
}

/**
 * One product as the detail / edit page needs it — the roster row plus the
 * `description`, the full ordered `images` gallery, the `variants` list, and the
 * `updatedAt` instant. A missing / cross-tenant id is a `404`, not an empty body,
 * so the page distinguishes "no such product" from a valid record.
 */
export interface AdminProductDetail extends AdminProductRow {
  description: string;
  images: string[];
  variants: ProductVariant[];
  updatedAt: string;
}

/** Successful `GET /admin/products/:id` response — the product detail spread flat. */
export type GetAdminProductResponse = AdminProductDetail;

/**
 * The editable product fields shared by the create + update bodies. `name` is
 * required; `description` is free text (empty allowed, normalised to `''`).
 * `priceAmount` is the base price in the currency's minor units — a non-negative
 * integer, defaulting to `0`. `currency` is a 3-letter ISO-4217 code, upper-cased
 * and defaulting to `USD`. `images` is the ordered gallery of R2 public URLs (each
 * a valid URL), capped at {@link MAX_PRODUCT_IMAGES}. `variants` is the full
 * variant list, defaulted to an empty array.
 */
const productProfileFields = {
  name: z.string().trim().min(1, 'Name is required').max(160),
  description: z.string().trim().max(2000).default(''),
  priceAmount: z.coerce
    .number()
    .int('Price must be a whole number of minor units')
    .nonnegative('Price cannot be negative')
    .default(0),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, 'Currency must be a 3-letter ISO code')
    .default('USD'),
  images: z
    .array(z.string().trim().max(2048).url('Each image must be a valid URL'))
    .max(MAX_PRODUCT_IMAGES, `A product can have at most ${MAX_PRODUCT_IMAGES} images`)
    .default([]),
  variants: productVariantsSchema,
};

/**
 * Body for `POST /admin/products` — create a product (T4.6). The profile fields
 * plus an initial `status` that defaults to `ACTIVE` (a staff-added product is
 * live unless explicitly created inactive). The API re-validates with this exact
 * schema, so the admin form and the controller can never drift.
 */
export const createProductSchema = z.object({
  ...productProfileFields,
  status: productStatusSchema.default('ACTIVE'),
});

/** Validated `POST /admin/products` body — {@link createProductSchema}. */
export type CreateProductInput = z.input<typeof createProductSchema>;

/** Parsed `POST /admin/products` body (after defaults/transforms applied). */
export type CreateProductData = z.infer<typeof createProductSchema>;

/**
 * Body for `PATCH /admin/products/:id` — edit a product (T4.6). The same mutable
 * profile fields as create; `status` is changed through the dedicated deactivate /
 * reactivate actions, not here.
 */
export const updateProductSchema = z.object(productProfileFields);

/** Validated `PATCH /admin/products/:id` body — {@link updateProductSchema}. */
export type UpdateProductInput = z.input<typeof updateProductSchema>;

/** Parsed `PATCH /admin/products/:id` body (after defaults/transforms applied). */
export type UpdateProductData = z.infer<typeof updateProductSchema>;

/**
 * Successful `POST /admin/products` response (`201 Created`) — the newly created
 * product as the detail page renders it.
 */
export type CreateProductResponse = AdminProductDetail;

/** Successful `PATCH /admin/products/:id` response — the updated product detail. */
export type UpdateProductResponse = AdminProductDetail;

/**
 * Successful `POST /admin/products/:id/deactivate` and `.../reactivate` response —
 * the product detail with the new `status` (`INACTIVE` / `ACTIVE`).
 */
export type SetProductStatusResponse = AdminProductDetail;
