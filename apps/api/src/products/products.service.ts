import { Injectable } from '@nestjs/common';
import { ProductStatus, type Prisma } from '@fit/db';
import {
  productVariantsSchema,
  type ListProductsQuery,
  type ListProductsResponse,
  type ProductSummary,
  type ProductVariantSummary,
} from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The columns the public listing selects off `Product`. A deliberately slim
 * projection of the gym's own retail content — no cross-tenant join, no
 * lifecycle/audit columns the storefront has no use for.
 */
const PRODUCT_SELECT = {
  id: true,
  name: true,
  description: true,
  priceAmount: true,
  currency: true,
  images: true,
  variants: true,
} satisfies Prisma.ProductSelect;

type ProductRecord = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

/**
 * Read access to a gym's purchasable products for the public shop catalogue
 * (`GET /products`).
 *
 * Powers the member-facing storefront on both surfaces: the mobile Shop tab
 * (T6.7) and the web shop listing (T7.6) — both gymId-scoped reads a visitor /
 * member browses, never a session. Distinct from the staff-only
 * {@link import('./admin-products.service').AdminProductsService} (`/admin/products`,
 * T4.6) which manages the same `Product` rows behind the `TenantGuard` +
 * permissions.
 *
 * Unlike the admin service this runs on the **base** {@link PrismaService}: the
 * route carries no tenant context (it is `@Public()` and excluded from the JWT
 * `TenantMiddleware`), so the gym is constrained explicitly by the `gymId` query
 * param. Only `ACTIVE` products are listed — a deactivated product drops off the
 * storefront while its row is preserved — and each is mapped to the slim public
 * {@link ProductSummary} (a single primary image, variants projected with their
 * resolved price + availability).
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List the gym's active products, ordered by name. Scoped by the explicit
   * `gymId` (an unknown gym simply matches nothing). An empty array is a normal
   * result the storefront renders as its "nothing for sale yet" state.
   */
  async listProducts(query: ListProductsQuery): Promise<ListProductsResponse> {
    const rows = await this.prisma.client.product.findMany({
      where: { gymId: query.gymId, status: ProductStatus.ACTIVE },
      select: PRODUCT_SELECT,
      orderBy: { name: 'asc' },
    });

    return { products: rows.map((row) => this.toSummary(row)) };
  }

  /**
   * Project a queried row to the public {@link ProductSummary}: the primary
   * (first) gallery image or `null`, and the stored variants resolved to their
   * public form.
   */
  private toSummary(row: ProductRecord): ProductSummary {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      priceAmount: row.priceAmount,
      currency: row.currency,
      imageUrl: row.images[0] ?? null,
      variants: this.toVariantSummaries(row),
    };
  }

  /**
   * Map a row's stored `variants` JSON to the public variant projection. Each
   * variant's `priceAmount` is resolved — the variant's own override when set,
   * else the product's base price — so the card never has to fold the two, and
   * `available` is whether it is in stock (an out-of-stock variant is still
   * listed but flagged, so the buyer sees what exists). The id is the variant's
   * stable position in the stored array (variants carry no persistent id of their
   * own). A legacy / hand-edited `variants` value that fails to parse yields an
   * empty list rather than breaking the listing.
   */
  private toVariantSummaries(row: ProductRecord): ProductVariantSummary[] {
    const parsed = productVariantsSchema.safeParse(row.variants ?? []);
    if (!parsed.success) {
      return [];
    }
    return parsed.data.map((variant, index) => ({
      id: String(index),
      name: variant.name,
      priceAmount: variant.priceAmount ?? row.priceAmount,
      available: variant.stock > 0,
    }));
  }
}
