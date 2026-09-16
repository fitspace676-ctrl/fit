import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  createBannerSchema,
  reorderBannersSchema,
  updateBannerSchema,
  uploadBannerImageSchema,
  type BannerResponse,
  type ListBannersResponse,
  type ReorderBannersResponse,
  type UploadBannerImageResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AdminBannersService } from './admin-banners.service';

/**
 * Staff-console banner management API (`/marketing/banners`, T1.16) — the
 * home-screen carousel the member app draws from `GET /banners`.
 *
 * Mounted under `/marketing` so it sits with the console's other growth tooling
 * (campaigns, promo codes) and reuses that area's capabilities rather than
 * inventing a permission: reads require {@link Permission.MarketingRead}, writes
 * {@link Permission.MarketingManage}. Every route is tenant-scoped staff access —
 * {@link TenantGuard} pins the request to one gym, {@link PermissionsGuard}
 * enforces the capability, and the service runs on the tenant-scoped Prisma
 * client, so no handler ever passes or trusts a `gymId`.
 *
 * A separate controller from `MarketingController` (which owns campaigns and
 * codes) so neither file has to grow a second subject; both carry the same guards
 * under the same prefix.
 */
@Controller('marketing/banners')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminBannersController {
  constructor(private readonly banners: AdminBannersService) {}

  /**
   * `GET /marketing/banners` — every banner, in carousel order. Unlike the member
   * listing this returns drafts, parked banners and expired ones too: the console
   * is where they are managed, so it must see what it is managing.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingRead)
  async list(): Promise<ListBannersResponse> {
    return this.banners.listBanners();
  }

  /**
   * `PATCH /marketing/banners/reorder` — the drag-and-drop save: each id's
   * position becomes its index in `ids`, applied in one transaction.
   *
   * Declared BEFORE {@link update} on purpose. Nest matches in declaration order,
   * so a `PATCH /marketing/banners/:id` route registered first would swallow
   * `/reorder` as an id and answer `404`.
   */
  @Patch('reorder')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingManage)
  async reorder(@Body() body: unknown): Promise<ReorderBannersResponse> {
    return this.banners.reorderBanners(parse(reorderBannersSchema, body));
  }

  /** `GET /marketing/banners/:id` — one banner. `404 BANNER_NOT_FOUND` on a miss. */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingRead)
  async getOne(@Param('id') id: string): Promise<BannerResponse> {
    return this.banners.getBanner(id);
  }

  /**
   * `POST /marketing/banners` — create a banner. The body is validated up front
   * (an inverted schedule window is a `400`); `imageUrl` is normally omitted, the
   * console finalising the artwork against the new id with {@link setImage}.
   * Returns `201` with the row.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.MarketingManage)
  async create(@Body() body: unknown): Promise<BannerResponse> {
    return this.banners.createBanner(parse(createBannerSchema, body));
  }

  /**
   * `PATCH /marketing/banners/:id` — edit a banner; only the keys present change.
   * A window that would end before it starts (checked against the stored row) is a
   * `400`; an unknown / cross-tenant id is a `404 BANNER_NOT_FOUND`.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingManage)
  async update(@Param('id') id: string, @Body() body: unknown): Promise<BannerResponse> {
    return this.banners.updateBanner(id, parse(updateBannerSchema, body));
  }

  /**
   * `POST /marketing/banners/:id/image` — finalise an artwork upload by its R2
   * `photoKey`, storing the resulting public URL on the banner and returning the
   * updated row. Same finalise flow as the gym logo; a key outside this gym's
   * prefix is a `400`, and R2 being unconfigured is a `503`.
   */
  @Post(':id/image')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingManage)
  async setImage(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<UploadBannerImageResponse> {
    return this.banners.setImage(id, parse(uploadBannerImageSchema, body));
  }

  /**
   * `DELETE /marketing/banners/:id` — remove a banner and free its image. `204` on
   * success, `404 BANNER_NOT_FOUND` on a miss.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.MarketingManage)
  async remove(@Param('id') id: string): Promise<void> {
    await this.banners.deleteBanner(id);
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
