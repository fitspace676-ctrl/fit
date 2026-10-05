import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  resolveMobileAppFeatures,
  type MobileAppSettings,
  type UpdateMobileAppSettingsInput,
} from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

const select = { mobileAppEnabled: true, mobileAppFeatures: true } as const;

@Injectable()
export class MobileAppSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async get(): Promise<MobileAppSettings> {
    const gym = await this.prisma.client.gym.findUnique({
      where: { id: this.tenant.gymId },
      select,
    });
    if (!gym) throw new NotFoundException('GYM_NOT_FOUND');
    return {
      enabled: gym.mobileAppEnabled,
      features: resolveMobileAppFeatures(gym.mobileAppFeatures),
    };
  }

  async update(input: UpdateMobileAppSettingsInput): Promise<MobileAppSettings> {
    // Gym is the tenant root: pin both the read and write explicitly to the verified session.
    const current = await this.get();
    if (!current.enabled) throw new ForbiddenException('MOBILE_APP_NOT_ENABLED');
    await this.prisma.client.gym.update({
      where: { id: this.tenant.gymId, mobileAppEnabled: true },
      data: { mobileAppFeatures: input.features },
    });
    return { enabled: true, features: input.features };
  }

  async bySlug(slug: string): Promise<MobileAppSettings> {
    // Public build configuration only. Never return the private gym settings blob.
    const gym = await this.prisma.client.gym.findUnique({
      where: { slug, status: 'ACTIVE' },
      select,
    });
    if (!gym) throw new NotFoundException('GYM_NOT_FOUND');
    return {
      enabled: gym.mobileAppEnabled,
      features: resolveMobileAppFeatures(gym.mobileAppFeatures),
    };
  }
}
