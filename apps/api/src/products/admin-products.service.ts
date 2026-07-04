import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductStatus, Prisma } from '@fit/db';
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  productVariantsSchema,
  type AdminProductDetail,
  type AdminProductRow,
  type CreateProductData,
  type CreateProductResponse,
  type GetAdminProductResponse,
  type ListAdminProductsQuery,
  type ListAdminProductsResponse,
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

/**
 * The columns the roster/detail queries select off `Product`. Every field is the
 * gym's own content (no cross-tenant join), so the whole row is safe to project.
 */
const PRODUCT_SELECT = {
  id: true,
  name: true,
  description: true,
  priceAmount: true,
  currency: true,
  images: true,
  variants: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

type ProductRecord = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

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
        select: { status: true, variants: true },
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
   * most-urgent variant (lowest on-hand) against {@link DEFAULT_LOW_STOCK_THRESHOLD},
   * so a deactivated product — off the storefront, stock moot — never trips an alert.
   * A product with no variants is untracked and counts toward neither bucket.
   */
  private summarize(
    scan: Array<{ status: ProductStatus; variants: Prisma.JsonValue }>,
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
      const variants = this.parseVariants(product.variants);
      if (variants.length === 0) {
        continue;
      }
      const lowest = Math.min(...variants.map((variant) => variant.stock));
      if (lowest === 0) {
        outOfStockCount += 1;
      } else if (lowest <= DEFAULT_LOW_STOCK_THRESHOLD) {
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
      select: { id: true, name: true, currency: true, images: true, variants: true },
      orderBy: { name: 'asc' },
    });

    const data: LowStockProductRow[] = [];
    for (const row of rows) {
      const low: LowStockVariant[] = [];
      this.parseVariants(row.variants).forEach((variant, variantIndex) => {
        if (variant.stock <= query.threshold) {
          low.push({
            variantIndex,
            name: variant.name,
            sku: variant.sku,
            stock: variant.stock,
          });
        }
      });
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
    const row = await this.prisma.client.product.create({
      data: {
        gymId: this.tenant.gymId,
        name: input.name,
        description: input.description,
        priceAmount: input.priceAmount,
        currency: input.currency,
        images: input.images,
        variants: input.variants as unknown as Prisma.InputJsonValue,
        status: input.status,
      },
      select: PRODUCT_SELECT,
    });
    return this.toDetail(row);
  }

  /**
   * Edit a product's profile (T4.6). The id must resolve to a product in the
   * caller's gym (the scoped `where` makes a cross-tenant id a `404`). `status` is
   * deliberately not editable here — it moves through {@link deactivateProduct} /
   * {@link reactivateProduct}. Returns the updated detail.
   */
  async updateProduct(id: string, input: UpdateProductData): Promise<UpdateProductResponse> {
    await this.requireProduct(id);
    await this.prisma.client.product.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        priceAmount: input.priceAmount,
        currency: input.currency,
        images: input.images,
        variants: input.variants as unknown as Prisma.InputJsonValue,
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
    return {
      id: row.id,
      name: row.name,
      priceAmount: row.priceAmount,
      currency: row.currency,
      imageUrl: row.images[0] ?? null,
      variantCount: variants.length,
      totalStock: variants.reduce((sum, variant) => sum + variant.stock, 0),
      lowestStock: variants.length === 0 ? null : Math.min(...variants.map((v) => v.stock)),
      status: row.status,
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
