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
 * Name and phone belong to the current gym's credential, with legacy User
 * values as a fallback. Platform accounts continue to use User directly.
 * Email always comes from the shared User identity.
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
    const gymId = this.tenant.current?.gymId ?? null;
    const credential = gymId
      ? await this.prisma.client.gymCredential.findUnique({
          where: { userId_gymId: { userId: id, gymId } },
          select: { name: true, phone: true },
        })
      : null;
    return {
      profile: {
        userId: user.id,
        name: credential?.name ?? user.name,
        email: user.email,
        phone: credential?.phone ?? user.phone,
      },
    };
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
    const gymId = this.tenant.current?.gymId ?? null;
    if (gymId) {
      await this.prisma.client.gymCredential.upsert({
        where: { userId_gymId: { userId: id, gymId } },
        create: { userId: id, gymId, passwordHash: null, ...data },
        update: data,
      });
      return this.getMyProfile();
    }
    const user = await this.prisma.client.user.update({
      where: { id },
      data,
      select: PROFILE_SELECT,
    });
    return { profile: { userId: user.id, name: user.name, email: user.email, phone: user.phone } };
  }
}
