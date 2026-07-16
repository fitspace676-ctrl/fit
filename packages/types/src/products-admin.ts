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

// ── Categories ────────────────────────────────────────────────────────────────
//
// A category is a gym-curated shelf a product may sit on ("Protein", "Drinks").
// Staff manage the list from the catalog; a product carries at most one, and
// `null` — uncategorised — is always valid. Deleting a category never deletes its
// products, it only un-shelves them (the Prisma relation is `SetNull`).

/** The longest a category name may be — long enough to label a shelf, short enough to chip. */
export const MAX_PRODUCT_CATEGORY_NAME = 60;

/** One category as the picker, the filter, and the manager list render it. */
export interface AdminProductCategory {
  id: string;
  name: string;
  /** How many products currently sit on this shelf — the manager shows it before a delete. */
  productCount: number;
}

/** Successful `GET /admin/product-categories` response — every category, by name. */
export interface ListAdminProductCategoriesResponse {
  data: AdminProductCategory[];
}

/**
 * The one editable field of a category. Trimmed, non-empty, and unique per gym —
 * a duplicate is a `409`, since `@@unique([gymId, name])` is what stops the same
 * shelf existing twice under two spellings.
 */
const productCategoryFields = {
  name: z
    .string()
    .trim()
    .min(1, 'Category name is required')
    .max(
      MAX_PRODUCT_CATEGORY_NAME,
      `Name must be ${MAX_PRODUCT_CATEGORY_NAME} characters or fewer`,
    ),
};

/** Body for `POST /admin/product-categories` — create a category. */
export const createProductCategorySchema = z.object(productCategoryFields);

/** Validated `POST /admin/product-categories` body — {@link createProductCategorySchema}. */
export type CreateProductCategoryInput = z.input<typeof createProductCategorySchema>;

/** Body for `PATCH /admin/product-categories/:id` — rename a category. */
export const updateProductCategorySchema = z.object(productCategoryFields);

/** Validated `PATCH /admin/product-categories/:id` body — {@link updateProductCategorySchema}. */
export type UpdateProductCategoryInput = z.input<typeof updateProductCategorySchema>;

/** Successful create / rename response — the category as the manager list renders it. */
export type ProductCategoryResponse = AdminProductCategory;

/**
 * Successful `DELETE /admin/product-categories/:id` response. `unshelved` is how
 * many products fell back to uncategorised, so the console can report the blast
 * radius it warned about.
 */
export interface DeleteProductCategoryResponse {
  unshelved: number;
}

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
  /**
   * Narrow to one category's shelf, or to {@link UNCATEGORISED_FILTER} for the
   * products not yet filed under any — the view staff need while working through a
   * freshly categorised catalogue. Omitted means every category.
   */
  categoryId: z.string().trim().min(1).optional(),
  sort: productSortSchema.default('name'),
  dir: sortDirSchema.default('asc'),
});

/**
 * The `categoryId` filter value meaning "products with no category". A sentinel
 * rather than a separate flag so the filter stays one round-trippable query param
 * the select can bind to directly; no real cuid collides with it.
 */
export const UNCATEGORISED_FILTER = 'none';

/** Validated `GET /admin/products` query — {@link listAdminProductsQuerySchema}. */
export type ListAdminProductsQuery = z.infer<typeof listAdminProductsQuerySchema>;

/**
 * One product as the roster grid renders it. `imageUrl` is the primary (first)
 * gallery image, or `null` when the product has no images (the card renders a
 * placeholder). `priceAmount` is the base price in `currency`'s minor units the
 * card formats. `variantCount` is the size of the variant list so the roster can
 * show "3 variants" without shipping the whole list. `totalStock` is the summed
 * on-hand count across the product's variants (0 when it has none) and `lowestStock`
 * is the smallest single-variant on-hand count — or `null` when the product has no
 * variants (stock is untracked) — so the card can render the right stock badge
 * without shipping the whole variant list. `createdAt` is an ISO-8601 instant the
 * card formats in the staff member's local zone.
 */
export interface AdminProductRow {
  id: string;
  name: string;
  priceAmount: number;
  /** Unit cost in `currency`'s minor units, or `null` when untracked. Drives margin. */
  costAmount: number | null;
  currency: string;
  imageUrl: string | null;
  variantCount: number;
  totalStock: number;
  lowestStock: number | null;
  status: ProductStatus;
  /** The shelf this product sits on, or `null` when uncategorised. */
  category: { id: string; name: string } | null;
  createdAt: string;
}

/**
 * At-a-glance totals across the whole filtered product roster (T4.5) — not just the
 * visible page — powering the catalog's KPI tiles and its low-stock surfacing.
 * `productCount` is the filtered count; `activeCount` is how many of those are
 * `ACTIVE`. `lowStockCount` and `outOfStockCount` count **active** products by their
 * most-urgent variant: out-of-stock when a variant has hit `0`, low when the lowest
 * variant sits between `1` and `lowStockThreshold` inclusive. `lowStockThreshold`
 * echoes {@link DEFAULT_LOW_STOCK_THRESHOLD} so the tiles can label the cushion.
 */
export const productRosterSummarySchema = z.object({
  productCount: z.number().int().nonnegative(),
  activeCount: z.number().int().nonnegative(),
  lowStockCount: z.number().int().nonnegative(),
  outOfStockCount: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative(),
});

/** The filtered product roster's totals — {@link productRosterSummarySchema}. */
export type ProductRosterSummary = z.infer<typeof productRosterSummarySchema>;

/**
 * Successful `GET /admin/products` response — one page of the roster, the totals the
 * pager needs, and the {@link ProductRosterSummary} across the whole filtered set the
 * catalog's KPI tiles render. `total` is the count *after* filters, `page` / `limit`
 * echo the request. An empty `data` is a normal result the grid renders as its empty
 * state.
 */
export interface ListAdminProductsResponse {
  data: AdminProductRow[];
  total: number;
  page: number;
  limit: number;
  summary: ProductRosterSummary;
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
  costAmount: z
    .preprocess(
      (value) => (value === '' || value === null || value === undefined ? null : value),
      z.coerce
        .number()
        .int('Cost must be a whole number of minor units')
        .nonnegative('Cost cannot be negative')
        .nullable(),
    )
    .default(null),
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
  /**
   * The category to shelve this product under. `null` — the default — is
   * uncategorised, and the form's empty select submits `''`, so both normalise to
   * `null`. An id belonging to another gym is rejected by the service, not here.
   */
  categoryId: z
    .preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      z.string().trim().min(1).nullable(),
    )
    .default(null),
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

// ── Inventory tracking + low-stock alerts (T7.8) ──────────────────────────────
//
// On-hand stock lives per-variant in the product's `variants` JSON (`stock`); a
// product sold as-is (no variants) is untracked. A completed online sale
// decrements the sold variant's `stock` at checkout, so the roster's numbers are
// the live on-hand count. The low-stock report surfaces every ACTIVE product
// carrying at least one variant at or below the alert threshold so staff can
// reorder before a line sells out.

/**
 * Default low-stock alert threshold (inclusive). A variant whose on-hand `stock`
 * is at or below this is "low" and surfaces on the report unless the caller
 * overrides the threshold. Chosen as a small reorder cushion, not zero, so the
 * alert fires before a line is fully out of stock.
 */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/** The largest threshold the low-stock report accepts (keeps the query bounded). */
export const MAX_LOW_STOCK_THRESHOLD = 1000;

/**
 * Query for `GET /admin/products/low-stock`. `threshold` is the inclusive on-hand
 * ceiling a variant must be at or below to count as low — a non-negative integer,
 * defaulting to {@link DEFAULT_LOW_STOCK_THRESHOLD} and capped at
 * {@link MAX_LOW_STOCK_THRESHOLD}. Coerced because it arrives as a query string.
 */
export const lowStockQuerySchema = z.object({
  threshold: z.coerce
    .number()
    .int('Threshold must be a whole number')
    .min(0, 'Threshold cannot be negative')
    .max(MAX_LOW_STOCK_THRESHOLD, `Threshold must be ${MAX_LOW_STOCK_THRESHOLD} or fewer`)
    .default(DEFAULT_LOW_STOCK_THRESHOLD),
});

/** Validated `GET /admin/products/low-stock` query — {@link lowStockQuerySchema}. */
export type LowStockQuery = z.infer<typeof lowStockQuerySchema>;

/**
 * One low-stock variant on the report. `variantIndex` is its position in the
 * product's variant array (variants have no id of their own — they live as a JSON
 * array, see the `variants` field), so staff can find it on the edit form.
 * `name` / `sku` label it and `stock` is the live on-hand count that tripped the
 * threshold.
 */
export interface LowStockVariant {
  variantIndex: number;
  name: string;
  sku: string;
  stock: number;
}

/**
 * One product on the low-stock report — the catalogue fields the alert list needs
 * plus only the variants that are at or below the threshold (a product with three
 * variants but one low variant lists just the one). `imageUrl` is the primary
 * gallery image or `null`; `lowestStock` is the smallest on-hand count across the
 * product's low variants, so the list can sort the most urgent products first.
 */
export interface LowStockProductRow {
  id: string;
  name: string;
  imageUrl: string | null;
  currency: string;
  variants: LowStockVariant[];
  lowestStock: number;
}

/**
 * Successful `GET /admin/products/low-stock` response — every ACTIVE product with
 * at least one low variant, most urgent first, plus the `threshold` the report was
 * run at so the page can label it. An empty `data` is a normal result (nothing is
 * low) the page renders as an all-clear state.
 */
export interface ListLowStockResponse {
  data: LowStockProductRow[];
  threshold: number;
}
