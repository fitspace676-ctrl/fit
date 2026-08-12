import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductStatus, Prisma } from '@fit/db';
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  UNCATEGORISED_FILTER,
  productVariantsSchema,
  resolveStockLevel,
  type AdminProductDetail,
  type AdminProductRow,
  type CreateProductData,
  type CreateProductResponse,
  type GetAdminProductResponse,
  type ListAdminProductsQuery,
  type ListAdminProductsResponse,
  type InventoryPositionRow,
  type InventoryQuery,
  type InventorySummary,
  type ListInventoryResponse,
  type ListLowStockResponse,
  type LowStockProductRow,
  type LowStockQuery,
  type LowStockVariant,
  type ProductRosterSummary,
  type ProductVariants,
  type SetProductStatusResponse,
  type UpdateProductData,
  type UpdateProductResponse,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { GymLocaleService } from '../gyms/gym-locale.service';

/**
 * The columns the roster/detail queries select off `Product`. Every field is the
 * gym's own content (no cross-tenant join), so the whole row is safe to project.
 */
const PRODUCT_SELECT = {
  id: true,
  name: true,
  description: true,
  priceAmount: true,
  costAmount: true,
  currency: true,
  images: true,
  variants: true,
  stock: true,
  lowStockThreshold: true,
  status: true,
  categoryId: true,
  // The category is the gym's own row (the relation can't cross tenants), and the
  // grid renders its name, so join it rather than making the console resolve ids.
  category: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

type ProductRecord = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

/**
 * Fold a product's stock — however it tracks it — into the two numbers every
 * surface reads: the total on hand, and the most-urgent single position.
 *
 * A product with variants counts per variant and ignores the base column; one
 * without counts in the base column alone. `lowestStock` is `null` only when
 * neither applies, which is what keeps "untracked" distinguishable from "out"
 * — a distinction the badge, the roster totals and the low-stock report all rest
 * on, so it is derived in exactly one place.
 */
export function tallyStock(
  variants: ProductVariants,
  baseStock: number | null | undefined,
): { totalStock: number; lowestStock: number | null } {
  if (variants.length > 0) {
    return {
      totalStock: variants.reduce((sum, variant) => sum + variant.stock, 0),
      lowestStock: Math.min(...variants.map((variant) => variant.stock)),
    };
  }
  // `undefined` as well as `null`: a caller reading through a narrower select has
  // not learned the count is zero, only that it did not ask — and answering "0"
  // there would report a stocked product as out of stock.
  if (baseStock === null || baseStock === undefined) {
    return { totalStock: 0, lowestStock: null };
  }
  return { totalStock: baseStock, lowestStock: baseStock };
}

/**
 * Staff-console product management for a gym (read + write, T4.6).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every `product` query
 * is auto-constrained to (and, on create, stamped with) the caller's gym by the
 * Prisma tenant extension, so staff can only ever read or mutate their own gym's
 * products — there is no `gymId` to pass or to forget. The roster is paginated
 * server-side so it scales without loading every product into memory.
 *
 * This service owns the editable shape of a product, including the ordered image
 * gallery (`images`, R2 public URLs uploaded by the admin form) and the structured
 * `variants` (stored as JSON), mirroring how {@link AdminLocationsService} owns a
 * location's `hours`.
 */
@Injectable()
export class AdminProductsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly locale: GymLocaleService,
  ) {}

  /**
   * One page of the gym's products, filtered + sorted server-side. `total` is the
   * filtered count (so the pager is accurate) and the page is bounded by
   * `skip`/`take`. An empty page is a normal result.
   */
  async listProducts(query: ListAdminProductsQuery): Promise<ListAdminProductsResponse> {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;

    // The page (a `skip`/`take` window) drives the grid; the count feeds the pager;
    // the lean status+variants scan over the *whole* filtered set powers the summary
    // KPI tiles (which must reflect every match, not just the visible page). Stock
    // lives inside each variant's JSON, so the low/out counts can't be a SQL
    // aggregate — the same in-memory pass the low-stock report uses.
    const [rows, total, scan] = await Promise.all([
      this.prisma.client.product.findMany({
        where,
        select: PRODUCT_SELECT,
        orderBy: this.buildOrderBy(query),
        skip,
        take: query.limit,
      }),
      this.prisma.client.product.count({ where }),
      this.prisma.client.product.findMany({
        where,
        select: { status: true, variants: true, stock: true, lowStockThreshold: true },
      }),
    ]);

    return {
      data: rows.map((row) => this.toRow(row)),
      total,
      page: query.page,
      limit: query.limit,
      summary: this.summarize(scan, total),
    };
  }

  /**
   * Fold the filtered roster's status + stock into the {@link ProductRosterSummary}
   * KPI tiles. `productCount` echoes the filtered `total`; `activeCount` counts the
   * `ACTIVE` matches; the low/out buckets classify each **active** product by its
   * most-urgent position — lowest variant, or the base count for a product with no
   * variants — against that product's own threshold, so a deactivated product (off
   * the storefront, stock moot) never trips an alert and an untracked one counts
   * toward neither bucket.
   */
  private summarize(
    scan: Array<{
      status: ProductStatus;
      variants: Prisma.JsonValue;
      stock: number | null;
      lowStockThreshold: number | null;
    }>,
    total: number,
  ): ProductRosterSummary {
    let activeCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const product of scan) {
      if (product.status !== ProductStatus.ACTIVE) {
        continue;
      }
      activeCount += 1;
      const { lowestStock } = tallyStock(this.parseVariants(product.variants), product.stock);
      const level = resolveStockLevel({
        lowestStock,
        lowStockThreshold: product.lowStockThreshold,
      });
      if (level === 'out') {
        outOfStockCount += 1;
      } else if (level === 'low') {
        lowStockCount += 1;
      }
    }

    return {
      productCount: total,
      activeCount,
      lowStockCount,
      outOfStockCount,
      lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
    };
  }

  /**
   * The low-stock report (T7.8) — every **active** product carrying at least one
   * variant whose on-hand `stock` is at or below `query.threshold`. Only `ACTIVE`
   * products are considered (a deactivated product is off the storefront, so its
   * stock is moot) and only the variants that tripped the threshold are returned
   * per product. Products are ordered most-urgent first (lowest single-variant
   * stock), so the alert list reads top-down. The threshold filter runs in memory
   * because stock lives inside each product's `variants` JSON, not as a column.
   */
  async listLowStock(query: LowStockQuery): Promise<ListLowStockResponse> {
    const rows = await this.prisma.client.product.findMany({
      where: { status: ProductStatus.ACTIVE },
      select: {
        id: true,
        name: true,
        currency: true,
        images: true,
        variants: true,
        stock: true,
        lowStockThreshold: true,
      },
      orderBy: { name: 'asc' },
    });

    const data: LowStockProductRow[] = [];
    for (const row of rows) {
      const low: LowStockVariant[] = [];
      const variants = this.parseVariants(row.variants);
      variants.forEach((variant, variantIndex) => {
        if (variant.stock <= query.threshold) {
          low.push({
            variantIndex,
            name: variant.name,
            sku: variant.sku,
            stock: variant.stock,
          });
        }
      });
      // A product sold as-is has one position, on the product itself. It only
      // qualifies once the gym is actually counting it — an untracked product has
      // no shortfall to report, however low the threshold is set.
      if (variants.length === 0 && row.stock !== null && row.stock <= query.threshold) {
        low.push({ variantIndex: null, name: row.name, sku: '', stock: row.stock });
      }
      if (low.length === 0) {
        continue;
      }
      data.push({
        id: row.id,
        name: row.name,
        imageUrl: row.images[0] ?? null,
        currency: row.currency,
        variants: low,
        lowestStock: Math.min(...low.map((variant) => variant.stock)),
      });
    }

    // Most urgent first; ties keep the alphabetical name order the query applied.
    data.sort((a, b) => a.lowestStock - b.lowestStock);

    return { data, threshold: query.threshold };
  }

  /**
   * The inventory overview — every product flattened into its addressable stock
   * positions, so a product with three variants contributes three rows and one
   * sold as-is contributes one. This is the "what do I stock, and how many?" view,
   * as distinct from the low-stock report's "what needs reordering?".
   *
   * Defaults to `ACTIVE` products: a deactivated line is off the storefront, so
   * its stock is not what anyone is counting. Flattening and paging happen in
   * memory because a position is not a row in the database — variant counts live
   * inside the product's JSON, so there is nothing for SQL to page over. The
   * summary is computed across the whole filtered set before the page is sliced,
   * so the tiles describe the gym's holdings rather than the visible page.
   */
  async listInventory(query: InventoryQuery): Promise<ListInventoryResponse> {
    const where: Prisma.ProductWhereInput = {
      status: query.status ?? ProductStatus.ACTIVE,
      ...(query.search
        ? { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } }
        : {}),
    };

    const rows = await this.prisma.client.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        currency: true,
        costAmount: true,
        variants: true,
        stock: true,
        lowStockThreshold: true,
      },
      orderBy: { name: 'asc' },
    });

    const positions: InventoryPositionRow[] = [];
    for (const row of rows) {
      const variants = this.parseVariants(row.variants);
      const base = {
        productId: row.id,
        productName: row.name,
        status: row.status,
        currency: row.currency,
        costAmount: row.costAmount,
        lowStockThreshold: row.lowStockThreshold,
      };
      if (variants.length > 0) {
        variants.forEach((variant, variantIndex) => {
          positions.push({
            ...base,
            variantIndex,
            label: variant.name,
            sku: variant.sku,
            stock: variant.stock,
            value: row.costAmount === null ? null : row.costAmount * variant.stock,
          });
        });
      } else {
        positions.push({
          ...base,
          variantIndex: null,
          label: row.name,
          sku: '',
          stock: row.stock,
          value: row.stock === null || row.costAmount === null ? null : row.costAmount * row.stock,
        });
      }
    }

    const filtered = query.tracked ? positions.filter((p) => p.stock !== null) : positions;

    const summary: InventorySummary = {
      positionCount: filtered.length,
      trackedCount: 0,
      lowCount: 0,
      outCount: 0,
      totalUnits: 0,
      totalValue: 0,
      valuedPositions: 0,
      // An empty (or fully filtered-out) inventory still has to label its zeros:
      // fall back to the gym's configured currency, never a hardcoded one.
      currency: filtered[0]?.currency ?? (await this.locale.get()).currency,
    };
    for (const position of filtered) {
      if (position.stock !== null) {
        summary.trackedCount += 1;
        summary.totalUnits += position.stock;
      }
      const level = resolveStockLevel({
        lowestStock: position.stock,
        lowStockThreshold: position.lowStockThreshold,
      });
      if (level === 'low') summary.lowCount += 1;
      if (level === 'out') summary.outCount += 1;
      if (position.value !== null) {
        summary.totalValue += position.value;
        summary.valuedPositions += 1;
      }
    }

    const skip = (query.page - 1) * query.limit;
    return {
      data: filtered.slice(skip, skip + query.limit),
      total: filtered.length,
      page: query.page,
      limit: query.limit,
      summary,
    };
  }

  /**
   * One product's detail for the detail / edit page. A missing id — or one
   * belonging to another tenant (the scoped `where` constrains `gymId`, so a
   * cross-tenant id never matches) — is a `404 PRODUCT_NOT_FOUND`.
   */
  async getProduct(id: string): Promise<GetAdminProductResponse> {
    const row = await this.prisma.client.product.findFirst({
      where: { id },
      select: PRODUCT_SELECT,
    });
    if (!row) {
      throw new NotFoundException({ message: 'Product not found', code: 'PRODUCT_NOT_FOUND' });
    }
    return this.toDetail(row);
  }

  /**
   * Create a product (T4.6). The whole insert runs on the tenant-scoped client, so
   * `gymId` is stamped from the request's tenant context by the extension; it is
   * also passed explicitly here as belt-and-braces and to satisfy the create
   * input's static type. The image gallery is stored as a string array and the
   * variants as JSON. Returns the new product's detail (`201`).
   */
  async createProduct(input: CreateProductData): Promise<CreateProductResponse> {
    await this.requireCategory(input.categoryId);
    const row = await this.prisma.client.product.create({
      data: {
        gymId: this.tenant.gymId,
        name: input.name,
        description: input.description,
        priceAmount: input.priceAmount,
        costAmount: input.costAmount,
        // The gym prices in exactly one currency (Settings → General); it is
        // stamped here rather than accepted from the client.
        currency: (await this.locale.get()).currency,
        images: input.images,
        variants: input.variants as unknown as Prisma.InputJsonValue,
        status: input.status,
        categoryId: input.categoryId,
      },
      select: PRODUCT_SELECT,
    });
    return this.toDetail(row);
  }

  /**
   * Assert a `categoryId` names a category in the **caller's** gym before it is
   * written to a product.
   *
   * The tenant extension constrains which *products* a query can reach, but it does
   * not vet the values inside the payload — a raw foreign key only has to exist in
   * `product_categories`, so without this check a crafted request could shelve a
   * product under another gym's category. The lookup runs on the scoped client, so
   * a foreign id reads as absent and lands as a `404`. `null` (uncategorised) is
   * always valid and skips the round-trip.
   */
  private async requireCategory(categoryId: string | null): Promise<void> {
    if (categoryId === null) {
      return;
    }
    const category = await this.prisma.client.productCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
  }

  /**
   * Edit a product's profile (T4.6). The id must resolve to a product in the
   * caller's gym (the scoped `where` makes a cross-tenant id a `404`). `status` is
   * deliberately not editable here — it moves through {@link deactivateProduct} /
   * {@link reactivateProduct}. Returns the updated detail.
   */
  async updateProduct(id: string, input: UpdateProductData): Promise<UpdateProductResponse> {
    await this.requireProduct(id);
    await this.requireCategory(input.categoryId);
    await this.prisma.client.product.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        priceAmount: input.priceAmount,
        costAmount: input.costAmount,
        // `currency` is intentionally untouched on edit: an existing product keeps
        // the currency it was sold in even if the gym later switches.
        images: input.images,
        variants: input.variants as unknown as Prisma.InputJsonValue,
        categoryId: input.categoryId,
      },
    });
    return this.getProduct(id);
  }

  /**
   * Deactivate a product (T4.6) — set `status` to `INACTIVE` so it drops off any
   * storefront while the record is preserved. Idempotent; `404`-on-miss.
   */
  async deactivateProduct(id: string): Promise<SetProductStatusResponse> {
    return this.setStatus(id, ProductStatus.INACTIVE);
  }

  /**
   * Reactivate a product (T4.6) — the inverse of {@link deactivateProduct}, setting
   * `status` back to `ACTIVE`. Idempotent and `404`-on-miss like its counterpart.
   */
  async reactivateProduct(id: string): Promise<SetProductStatusResponse> {
    return this.setStatus(id, ProductStatus.ACTIVE);
  }

  /** Set a product's lifecycle `status`, 404-ing an unknown / cross-tenant id. */
  private async setStatus(id: string, status: ProductStatus): Promise<SetProductStatusResponse> {
    await this.requireProduct(id);
    await this.prisma.client.product.update({ where: { id }, data: { status } });
    return this.getProduct(id);
  }

  /**
   * Resolve a product in the caller's gym or throw `404 PRODUCT_NOT_FOUND`. The
   * scoped `where` constrains `gymId`, so a cross-tenant id never matches — the
   * guard for every write.
   */
  private async requireProduct(id: string): Promise<{ id: string }> {
    const product = await this.prisma.client.product.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException({ message: 'Product not found', code: 'PRODUCT_NOT_FOUND' });
    }
    return product;
  }

  /**
   * The tenant-scoped `where` for the roster (the extension adds `gymId`), narrowed
   * by an optional `status` and a case-insensitive `search` across the product's
   * name + description.
   */
  private buildWhere(query: ListAdminProductsQuery): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    // The sentinel means "not filed under any shelf"; anything else is a real id.
    // A stale id (its category since deleted) simply matches nothing — an empty
    // roster, not an error, since the filter is a view and not a mutation.
    if (query.categoryId) {
      where.categoryId = query.categoryId === UNCATEGORISED_FILTER ? null : query.categoryId;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /** Map the requested sort column to a Prisma `orderBy`. */
  private buildOrderBy(query: ListAdminProductsQuery): Prisma.ProductOrderByWithRelationInput {
    switch (query.sort) {
      case 'price':
        return { priceAmount: query.dir };
      case 'status':
        return { status: query.dir };
      case 'createdAt':
        return { createdAt: query.dir };
      case 'name':
      default:
        return { name: query.dir };
    }
  }

  /**
   * Normalise a row's stored `variants` JSON to a validated {@link ProductVariants}
   * array. A row written by this service is already well-formed; the safe-parse
   * fallback keeps a legacy / hand-edited value from breaking the projection (it
   * renders as an empty variant list).
   */
  private parseVariants(value: Prisma.JsonValue): ProductVariants {
    const parsed = productVariantsSchema.safeParse(value ?? []);
    return parsed.success ? parsed.data : [];
  }

  /** Project a queried row to the denormalised roster {@link AdminProductRow}. */
  private toRow(row: ProductRecord): AdminProductRow {
    const variants = this.parseVariants(row.variants);
    const { totalStock, lowestStock } = tallyStock(variants, row.stock);
    return {
      id: row.id,
      name: row.name,
      priceAmount: row.priceAmount,
      costAmount: row.costAmount,
      currency: row.currency,
      imageUrl: row.images[0] ?? null,
      variantCount: variants.length,
      totalStock,
      lowestStock,
      stock: variants.length === 0 ? (row.stock ?? null) : null,
      lowStockThreshold: row.lowStockThreshold ?? null,
      status: row.status,
      category: row.category ? { id: row.category.id, name: row.category.name } : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Project a queried row to the full {@link AdminProductDetail}. */
  private toDetail(row: ProductRecord): AdminProductDetail {
    return {
      ...this.toRow(row),
      description: row.description,
      images: row.images,
      variants: this.parseVariants(row.variants),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
