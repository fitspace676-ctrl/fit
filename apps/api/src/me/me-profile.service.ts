import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  GetMeProfileResponse,
  UpdateMeProfileInput,
  UpdateMeProfileResponse,
} from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** The User columns the profile screen reads / writes. */
const PROFILE_SELECT = { id: true, name: true, email: true, phone: true } as const;

/**
 * Member-facing read/update of the caller's own profile (`/me/profile`).
 *
 * Profile fields (name, email, phone) are User attributes — they travel with the
 * person across the gyms they belong to — so this reads the raw
 * {@link PrismaService} keyed by the session's `userId`, not the tenant-scoped
 * client. The caller can only ever touch their own row.
 */
@Injectable()
export class MeProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private requireUserId(): string {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new ForbiddenException({
        message: 'A signed-in session is required',
        code: 'SESSION_REQUIRED',
      });
    }
    return userId;
  }

  /** The caller's profile. */
  async getMyProfile(): Promise<GetMeProfileResponse> {
    const id = this.requireUserId();
    const user = await this.prisma.client.user.findUnique({
      where: { id },
      select: PROFILE_SELECT,
    });
    if (!user) {
      throw new NotFoundException({ message: 'Profile not found', code: 'PROFILE_NOT_FOUND' });
    }
    return { profile: { userId: user.id, name: user.name, email: user.email, phone: user.phone } };
  }

  /** Patch the caller's profile — only the present fields are written. */
  async updateMyProfile(input: UpdateMeProfileInput): Promise<UpdateMeProfileResponse> {
    const id = this.requireUserId();
    const data: { name?: string; phone?: string | null } = {};
    if (input.name !== undefined) {
      data.name = input.name;
    }
    if (input.phone !== undefined) {
      data.phone = input.phone;
    }
    const user = await this.prisma.client.user.update({
      where: { id },
      data,
      select: PROFILE_SELECT,
    });
    return { profile: { userId: user.id, name: user.name, email: user.email, phone: user.phone } };
  }
}
