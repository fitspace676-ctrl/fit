import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  resolveMobileAppFeatures,
  resolveMobileAppLoginImage,
  resolveMobileAppPrimaryColor,
  type MobileAppSettings,
  type UpdateMobileAppSettingsInput,
  type UploadMobileAppLoginImageInput,
} from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { MediaCleanupService } from '../storage/media-cleanup.service';
import { StorageService } from '../storage/storage.service';

// `settings` is read for the fields the app falls back to: the member portal's
// sign-in photo and its colour, then the brand colour. The blob itself never
// leaves this service.
const select = {
  mobileAppEnabled: true,
  mobileAppFeatures: true,
  mobileAppLoginImageUrl: true,
  mobileAppPrimaryColor: true,
  settings: true,
} as const;

interface GymRow {
  mobileAppEnabled: boolean;
  mobileAppFeatures: unknown;
  mobileAppLoginImageUrl: string | null;
  mobileAppPrimaryColor: string | null;
  settings: unknown;
}

function toSettings(gym: GymRow): MobileAppSettings {
  const portal = (gym.settings as { memberPortal?: { loginImageUrl?: unknown } } | null)
    ?.memberPortal?.loginImageUrl;
  return {
    enabled: gym.mobileAppEnabled,
    features: resolveMobileAppFeatures(gym.mobileAppFeatures),
    ...resolveMobileAppLoginImage(gym.mobileAppEnabled, gym.mobileAppLoginImageUrl, portal),
    ...resolveMobileAppPrimaryColor(gym.mobileAppEnabled, gym.mobileAppPrimaryColor, gym.settings),
  };
}

@Injectable()
export class MobileAppSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly storage: StorageService,
    private readonly media: MediaCleanupService,
  ) {}

  async get(): Promise<MobileAppSettings> {
    return toSettings(await this.loadOwnGym());
  }

  async update(input: UpdateMobileAppSettingsInput): Promise<MobileAppSettings> {
    // Gym is the tenant root: pin both the read and write explicitly to the verified session.
    const gym = await this.loadOwnGym();
    if (!gym.mobileAppEnabled) throw new ForbiddenException('MOBILE_APP_NOT_ENABLED');
    const data = {
      ...(input.features !== undefined ? { mobileAppFeatures: input.features } : {}),
      ...(input.primaryColor !== undefined ? { mobileAppPrimaryColor: input.primaryColor } : {}),
    };
    await this.prisma.client.gym.update({
      where: { id: this.tenant.gymId, mobileAppEnabled: true },
      data,
    });
    return toSettings({ ...gym, ...data });
  }

  /**
   * `POST /gyms/app-settings/login-image` — finalise the app's own sign-in photo.
   * The member portal's finalise flow: the browser has already `PUT` the file to
   * R2 under this gym's `logos` prefix, and only a key under `{gymId}/` is taken.
   */
  async setLoginImage(input: UploadMobileAppLoginImageInput): Promise<MobileAppSettings> {
    const gymId = this.tenant.gymId;
    if (!input.photoKey.startsWith(`${gymId}/`)) {
      throw new BadRequestException('photoKey does not belong to this gym');
    }
    const url = this.storage.publicUrl(input.photoKey);
    if (!url) {
      throw new ServiceUnavailableException('Object storage (R2) public URL is not configured');
    }
    return this.writeLoginImage(url);
  }

  /** `DELETE /gyms/app-settings/login-image` — fall back to the portal's photo. */
  async clearLoginImage(): Promise<MobileAppSettings> {
    return this.writeLoginImage(null);
  }

  async bySlug(slug: string): Promise<MobileAppSettings> {
    // Public build configuration only. Never return the private gym settings blob.
    const gym = await this.prisma.client.gym.findUnique({
      where: { slug, status: 'ACTIVE' },
      select,
    });
    if (!gym) throw new NotFoundException('GYM_NOT_FOUND');
    return toSettings(gym);
  }

  private async loadOwnGym(): Promise<GymRow> {
    const gym = await this.prisma.client.gym.findUnique({
      where: { id: this.tenant.gymId },
      select,
    });
    if (!gym) throw new NotFoundException('GYM_NOT_FOUND');
    return gym;
  }

  private async writeLoginImage(url: string | null): Promise<MobileAppSettings> {
    const gym = await this.loadOwnGym();
    if (!gym.mobileAppEnabled) throw new ForbiddenException('MOBILE_APP_NOT_ENABLED');
    await this.prisma.client.gym.update({
      where: { id: this.tenant.gymId, mobileAppEnabled: true },
      data: { mobileAppLoginImageUrl: url },
    });
    // Best-effort, after the commit. The cleanup re-checks every reference first,
    // so a file the member portal also uses survives the app letting go of it.
    await this.media.discardUnreferenced(this.tenant.gymId, [gym.mobileAppLoginImageUrl], [url]);
    return toSettings({ ...gym, mobileAppLoginImageUrl: url });
  }
}
