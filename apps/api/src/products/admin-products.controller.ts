import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  adjustStockSchema,
  createProductSchema,
  inventoryQuerySchema,
  listAdminProductsQuerySchema,
  listStockMovementsQuerySchema,
  lowStockQuerySchema,
  setProductCategorySchema,
  updateProductSchema,
  type AdjustStockResponse,
  type CreateProductResponse,
  type GetAdminProductResponse,
  type ListAdminProductsResponse,
  type ListInventoryResponse,
  type ListLowStockResponse,
  type ListStockMovementsResponse,
  type SetProductCategoryResponse,
  type SetProductStatusResponse,
  type UpdateProductResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { TenantContext } from '../common/tenant/tenant.context';
import { assertPermission } from '../common/rbac/assert-permission';
import { AdminProductsService } from './admin-products.service';
import { ProductStockService } from './product-stock.service';

/**
 * Staff-console product management API (`/admin/products`, T4.6).
 *
 * Mounted under `/admin/products` (mirroring `admin/locations`) so it sits
 * alongside the staff console's other tenant-scoped management surfaces. Every
 * route here is tenant-scoped staff access: {@link TenantGuard} pins the request
 * to one gym and {@link PermissionsGuard} enforces the capability. Reads require
 * {@link Permission.ProductRead}; the writes — create, edit, and
 * deactivate/reactivate — require {@link Permission.ProductWrite}. The service
 * runs on the tenant-scoped Prisma client, so no handler ever passes a `gymId`.
 */
@Controller('admin/products')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminProductsController {
  constructor(
    private readonly products: AdminProductsService,
    private readonly stock: ProductStockService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * Changing what a product costs or sells for is `product:pricing`, a
   * capability on top of `product:write`. The schema defaults a missing
   * `priceAmount` to 0, so the raw body is what tells us whether the caller
   * *sent* a price — hence the check here, before parsing.
   */
  private assertPricingAllowed(body: unknown): void {
    if (!body || typeof body !== 'object') return;
    const fields = body as Record<string, unknown>;
    const variants = Array.isArray(fields.variants) ? (fields.variants as unknown[]) : [];
    const sendsPricing =
      'priceAmount' in fields ||
      'costAmount' in fields ||
      variants.some(
        (variant) => !!variant && typeof variant === 'object' && 'priceAmount' in variant,
      );
    if (sendsPricing) {
      assertPermission(this.tenant.role, Permission.ProductPricing);
    }
  }

  /**
   * `GET /admin/products?page&limit&search&status&sort&dir` — one filtered,
   * server-paginated page of the gym's products. The query is validated up front
   * (a bad page/limit/status is a `400` with per-field detail) so the service only
   * sees a well-formed, defaulted request. An empty page is a normal `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductRead)
  async list(@Query() query: unknown): Promise<ListAdminProductsResponse> {
    return this.products.listProducts(parse(listAdminProductsQuerySchema, query));
  }

  /**
   * `GET /admin/products/low-stock?threshold` — the low-stock report (T7.8): every
   * active product carrying a variant at or below the threshold, most urgent first.
   * Declared before `:id` so the literal path is matched ahead of the param route.
   * A bad `threshold` is a `400`; the default applies when it is omitted.
   */
  @Get('low-stock')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.InventoryRead)
  async lowStock(@Query() query: unknown): Promise<ListLowStockResponse> {
    return this.products.listLowStock(parse(lowStockQuerySchema, query));
  }

  /**
   * `GET /admin/products/inventory?page&limit&search&status&tracked` — every
   * product flattened into its stock positions with on-hand counts and totals.
   * Declared before `:id` so the literal path wins over the param route.
   */
  @Get('inventory')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.InventoryRead)
  async inventory(@Query() query: unknown): Promise<ListInventoryResponse> {
    return this.products.listInventory(parse(inventoryQuerySchema, query));
  }

  /**
   * `GET /admin/products/:id` — one product's detail. An unknown or cross-tenant id
   * is a `404 PRODUCT_NOT_FOUND` from the service.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductRead)
  async getOne(@Param('id') id: string): Promise<GetAdminProductResponse> {
    return this.products.getProduct(id);
  }

  /**
   * `POST /admin/products` — create a product (T4.6). The body is validated up
   * front (`name` required; `description` / `priceAmount` / `currency` / `images` /
   * `variants` optional, `status` defaults to `ACTIVE`). Returns `201` with the
   * detail.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.ProductWrite)
  async create(@Body() body: unknown): Promise<CreateProductResponse> {
    this.assertPricingAllowed(body);
    return this.products.createProduct(parse(createProductSchema, body));
  }

  /**
   * `PATCH /admin/products/:id` — edit a product's profile (T4.6). An unknown or
   * cross-tenant id is a `404 PRODUCT_NOT_FOUND`. Returns the updated detail.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductWrite)
  async update(@Param('id') id: string, @Body() body: unknown): Promise<UpdateProductResponse> {
    this.assertPricingAllowed(body);
    return this.products.updateProduct(id, parse(updateProductSchema, body));
  }

  /**
   * `PATCH /admin/products/:id/category` — file the product onto a shelf, or take
   * it off one with `{ "categoryId": null }`.
   *
   * Separate from `PATCH :id` (which replaces the whole product) so the roster can
   * offer the move directly: filing a catalogue is many small writes in a row, and
   * each one here touches the single column it names. A category belonging to
   * another gym is a `404`, as is an unknown product. Requires `ProductWrite`
   * (and `ProductPricing` when the body carries a price or cost).
   */
  @Patch(':id/category')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductWrite)
  async setCategory(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<SetProductCategoryResponse> {
    return this.products.setProductCategory(id, parse(setProductCategorySchema, body));
  }

  /**
   * `POST /admin/products/:id/deactivate` — set the product's status to `INACTIVE`
   * (T4.6). Idempotent; a `404` for an unknown / cross-tenant id. Returns the
   * updated detail.
   */
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductWrite)
  async deactivate(@Param('id') id: string): Promise<SetProductStatusResponse> {
    return this.products.deactivateProduct(id);
  }

  /**
   * `POST /admin/products/:id/reactivate` — set the product's status back to
   * `ACTIVE` (T4.6), the inverse of {@link deactivate}. Idempotent; `404`-on-miss.
   */
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductWrite)
  async reactivate(@Param('id') id: string): Promise<SetProductStatusResponse> {
    return this.products.reactivateProduct(id);
  }

  /**
   * `POST /admin/products/:id/stock` — move one stock position and record why.
   *
   * The write path for day-to-day inventory: a delivery landing, a breakage
   * written off, a shelf recounted. Deliberately separate from `PATCH :id` (which
   * replaces the whole product) because it applies atomically against the current
   * count, so two staff restocking at once compose instead of overwriting.
   *
   * A body that is neither a delta nor an absolute count — or is both — is a
   * `400`, as is a change that would drive the count negative. Requires
   * `InventoryAdjust`; a `RECOUNT` additionally needs `StocktakePerform`.
   */
  @Post(':id/stock')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.InventoryAdjust)
  async adjustStock(@Param('id') id: string, @Body() body: unknown): Promise<AdjustStockResponse> {
    return this.stock.adjust(id, parse(adjustStockSchema, body));
  }

  /**
   * `GET /admin/products/:id/stock-movements?page&limit` — that product's ledger,
   * newest first, so "why is this 3?" is answerable from the console. Read-only,
   * and gated on `StockMovementRead`.
   */
  @Get(':id/stock-movements')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.StockMovementRead)
  async stockMovements(
    @Param('id') id: string,
    @Query() query: unknown,
  ): Promise<ListStockMovementsResponse> {
    return this.stock.listMovements(id, parse(listStockMovementsQuerySchema, query));
  }
}

/**
 * Parse `data` with `schema`, raising a `400` whose body lists each failing field
 * as `path: message` — mirroring the other controllers so validation errors read
 * identically across the API.
 */
function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, data: unknown): z.infer<TSchema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    );
  }
  return result.data as z.infer<TSchema>;
}
