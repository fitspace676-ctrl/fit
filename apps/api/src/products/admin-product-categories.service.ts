import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@fit/db';
import type {
  AdminProductCategory,
  CreateProductCategoryInput,
  DeleteProductCategoryResponse,
  ListAdminProductCategoriesResponse,
  ProductCategoryResponse,
  UpdateProductCategoryInput,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** The category columns the console renders, plus the shelf's product count. */
const CATEGORY_SELECT = {
  id: true,
  name: true,
  _count: { select: { products: true } },
} satisfies Prisma.ProductCategorySelect;

type CategoryRecord = Prisma.ProductCategoryGetPayload<{ select: typeof CATEGORY_SELECT }>;

/** Prisma's code for a violated unique constraint — here, `@@unique([gymId, name])`. */
const UNIQUE_VIOLATION = 'P2002';

/**
 * Staff-console management of a gym's product categories.
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}, so every read and write
 * is auto-constrained to (and, on create, stamped with) the caller's gym — another
 * gym's category simply reads as absent and lands as a `404`.
 *
 * Deleting a category never deletes products. The Prisma relation is `SetNull`, so
 * the rows on that shelf fall back to uncategorised and the count of those is
 * returned, letting the console confirm the blast radius it warned about.
 */
@Injectable()
export class AdminProductCategoriesService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** Every category in the gym, by name — the order the picker and manager render. */
  async listCategories(): Promise<ListAdminProductCategoriesResponse> {
    const rows = await this.prisma.client.productCategory.findMany({
      select: CATEGORY_SELECT,
      orderBy: { name: 'asc' },
    });
    return { data: rows.map((row) => this.toCategory(row)) };
  }

  /**
   * Create a category. `gymId` is stamped by the tenant extension and passed here
   * to satisfy the create input's static type. A name already used in this gym is a
   * `409` — the unique index is the authority, so a race can't slip a duplicate past
   * a read-then-write check.
   */
  async createCategory(input: CreateProductCategoryInput): Promise<ProductCategoryResponse> {
    try {
      const row = await this.prisma.client.productCategory.create({
        data: { gymId: this.tenant.gymId, name: input.name },
        select: CATEGORY_SELECT,
      });
      return this.toCategory(row);
    } catch (error) {
      throw this.rethrowDuplicate(error, input.name);
    }
  }

  /** Rename a category. `404` when it isn't this gym's; `409` on a name collision. */
  async renameCategory(
    id: string,
    input: UpdateProductCategoryInput,
  ): Promise<ProductCategoryResponse> {
    await this.requireCategory(id);
    try {
      const row = await this.prisma.client.productCategory.update({
        where: { id },
        data: { name: input.name },
        select: CATEGORY_SELECT,
      });
      return this.toCategory(row);
    } catch (error) {
      throw this.rethrowDuplicate(error, input.name);
    }
  }

  /**
   * Delete a category, un-shelving its products rather than deleting them. The
   * count is read before the delete because `SetNull` clears the link as it goes —
   * afterwards there is nothing left to count.
   */
  async deleteCategory(id: string): Promise<DeleteProductCategoryResponse> {
    await this.requireCategory(id);
    const unshelved = await this.prisma.client.product.count({ where: { categoryId: id } });
    await this.prisma.client.productCategory.delete({ where: { id } });
    return { unshelved };
  }

  /** Assert the id names a category in the caller's gym, or `404`. */
  private async requireCategory(id: string): Promise<void> {
    const category = await this.prisma.client.productCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
  }

  /** Turn Prisma's unique-constraint error into the `409` the console reports inline. */
  private rethrowDuplicate(error: unknown, name: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
      return new ConflictException(`A category named “${name}” already exists`);
    }
    return error;
  }

  private toCategory(row: CategoryRecord): AdminProductCategory {
    return { id: row.id, name: row.name, productCount: row._count.products };
  }
}
