import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Banner as BannerRow } from '@fit/db';
import type {
  Banner,
  BannerResponse,
  CreateBannerInput,
  ListBannersResponse,
  ReorderBannersInput,
  UpdateBannerInput,
  UploadBannerImageInput,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { MediaCleanupService } from '../storage/media-cleanup.service';
import { StorageService } from '../storage/storage.service';

/**
 * The carousel's total order, used by every read here and mirrored by the public
 * listing: position first, then oldest first so banners left at the default
 * `sortOrder` still come back in a stable order.
 */
const BANNER_ORDER = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

/**
 * Staff-console banner management behind `/marketing/banners` (T1.16) — the CRUD
 * the member app's home carousel is fed from.
 *
 * Runs on the tenant-scoped Prisma client, so no method passes or trusts a
 * `gymId`: a cross-tenant id simply matches nothing and is the same `404` as an
 * unknown one. `Banner` is listed in `TENANT_SCOPED_MODELS`, which is what makes
 * that true — the `where` here carries only the id.
 *
 * Lives beside the *public* {@link import('./banners.service').BannersService}
 * rather than inside `marketing/` because the two halves of one small feature are
 * easier to keep honest in one folder; the route prefix is still `/marketing`, so
 * the console finds banners where the rest of its growth tooling is.
 */
@Injectable()
export class AdminBannersService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly storage: StorageService,
    private readonly media: MediaCleanupService,
  ) {}

  /** Every banner the gym has — live or not, drafted or finished — in carousel order. */
  async listBanners(): Promise<ListBannersResponse> {
    const rows = await this.prisma.client.banner.findMany({ orderBy: BANNER_ORDER });
    return { banners: rows.map(toBanner) };
  }

  /** One banner. A missing / cross-tenant id is a `404 BANNER_NOT_FOUND`. */
  async getBanner(id: string): Promise<BannerResponse> {
    return { banner: toBanner(await this.requireBanner(id)) };
  }

  /**
   * Create a banner. `imageUrl` is normally absent — the console creates the row,
   * then finalises the artwork against its id — so a new banner starts as a draft
   * the member listing skips. When `sortOrder` is omitted the banner is appended:
   * one past the highest position in use, so a new slide lands at the end of the
   * reel rather than silently on top of whatever sits at 0.
   */
  async createBanner(input: CreateBannerInput): Promise<BannerResponse> {
    const sortOrder = input.sortOrder ?? (await this.nextSortOrder());
    const created = await this.prisma.client.banner.create({
      data: {
        gymId: this.tenant.gymId,
        title: input.title ?? null,
        imageUrl: input.imageUrl ?? '',
        linkUrl: input.linkUrl ?? null,
        sortOrder,
        isActive: input.isActive,
        startsAt: toDate(input.startsAt),
        endsAt: toDate(input.endsAt),
      },
    });
    return { banner: toBanner(created) };
  }

  /**
   * Edit a banner. Only the keys present change; `null` clears a nullable field.
   *
   * The window is re-checked against the STORED row, not just the patch: moving
   * one end alone is the common edit, and the schema cannot see the other end. A
   * patch that would leave `endsAt` at or before `startsAt` is a `400`, so a banner
   * can never be saved into a window that can never open.
   */
  async updateBanner(id: string, input: UpdateBannerInput): Promise<BannerResponse> {
    const current = await this.requireBanner(id);

    const startsAt = input.startsAt !== undefined ? toDate(input.startsAt) : current.startsAt;
    const endsAt = input.endsAt !== undefined ? toDate(input.endsAt) : current.endsAt;
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException(['endsAt: endsAt must be after startsAt']);
    }

    const updated = await this.prisma.client.banner.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.linkUrl !== undefined ? { linkUrl: input.linkUrl } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.startsAt !== undefined ? { startsAt } : {}),
        ...(input.endsAt !== undefined ? { endsAt } : {}),
      },
    });

    // An edit that replaces the artwork by URL drops the old object's last
    // reference; free it. Best-effort by design — the nightly sweep is the backstop.
    if (input.imageUrl !== undefined && input.imageUrl !== current.imageUrl) {
      await this.media.discardUnreferenced([current.imageUrl], [updated.imageUrl]);
    }

    return { banner: toBanner(updated) };
  }

  /**
   * Delete a banner. The row is the only thing that referenced its image, so the
   * object is freed here rather than waiting a night for the sweep.
   */
  async deleteBanner(id: string): Promise<void> {
    const current = await this.requireBanner(id);
    await this.prisma.client.banner.delete({ where: { id } });
    await this.media.discardUnreferenced([current.imageUrl], []);
  }

  /**
   * `POST /marketing/banners/:id/image` — finalise an artwork upload by its R2
   * `photoKey`. The client has already `PUT` the image to R2 via a presigned
   * `POST /uploads` (with `entity: 'banners'`); here the key becomes a public URL
   * stored on the banner, and the image it replaces is freed.
   *
   * The key must live under this gym's own prefix (`{gymId}/…`, the namespace the
   * signed-upload service mints) — a key naming another tenant's object is a
   * `400`, so a banner can never be pointed at a foreign upload. A `503` surfaces
   * when no public base URL is configured (R2 disabled), mirroring the uploader
   * and the gym-logo finalise route this follows.
   */
  async setImage(id: string, input: UploadBannerImageInput): Promise<BannerResponse> {
    const gymId = this.tenant.gymId;
    if (!input.photoKey.startsWith(`${gymId}/`)) {
      throw new BadRequestException('photoKey does not belong to this gym');
    }

    const imageUrl = this.storage.publicUrl(input.photoKey);
    if (!imageUrl) {
      throw new ServiceUnavailableException('Object storage (R2) public URL is not configured');
    }

    const current = await this.requireBanner(id);
    const updated = await this.prisma.client.banner.update({ where: { id }, data: { imageUrl } });
    await this.media.discardUnreferenced([current.imageUrl], [imageUrl]);

    return { banner: toBanner(updated) };
  }

  /**
   * Rearrange the reel: each id's `sortOrder` becomes its index in `ids`.
   *
   * Every id is verified to belong to the gym FIRST, and the writes run in one
   * transaction — a reorder either lands whole or not at all, so the carousel is
   * never read half-rearranged. An unknown id is a `404` with nothing written.
   */
  async reorderBanners(input: ReorderBannersInput): Promise<ListBannersResponse> {
    const owned = await this.prisma.client.banner.findMany({
      where: { id: { in: input.ids } },
      select: { id: true },
    });
    if (owned.length !== new Set(input.ids).size) {
      throw new NotFoundException({
        message: 'One or more banners were not found',
        code: 'BANNER_NOT_FOUND',
      });
    }

    await this.prisma.client.$transaction(
      input.ids.map((id, index) =>
        this.prisma.client.banner.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    return this.listBanners();
  }

  /** The banner or a `404` — the single place the not-found shape is spelled. */
  private async requireBanner(id: string): Promise<BannerRow> {
    const row = await this.prisma.client.banner.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException({ message: 'Banner not found', code: 'BANNER_NOT_FOUND' });
    }
    return row;
  }

  /** One past the highest position in use, so a new banner is appended. */
  private async nextSortOrder(): Promise<number> {
    const last = await this.prisma.client.banner.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return last ? last.sortOrder + 1 : 0;
  }
}

/** Row → wire shape: instants as ISO strings, everything else as stored. */
function toBanner(row: BannerRow): Banner {
  return {
    id: row.id,
    gymId: row.gymId,
    title: row.title,
    imageUrl: row.imageUrl,
    linkUrl: row.linkUrl,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** An optional ISO instant from the wire as a `Date` (or `null` to clear). */
function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}
