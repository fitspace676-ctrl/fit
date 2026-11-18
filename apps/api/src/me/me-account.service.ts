import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@fit/db';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

@Injectable()
export class MeAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async deleteMyAccount(): Promise<void> {
    const userId = this.tenant.userId;
    if (!userId)
      throw new ForbiddenException({ code: 'SESSION_REQUIRED', message: 'Sign in first' });
    // Unscoped deliberately: deletion covers the identity in every gym.
    await this.prisma.client.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('Account not found');
        const staff = await tx.gymMember.findFirst({
          where: { userId, deletedAt: null, role: { not: Role.MEMBER } },
          select: { id: true },
        });
        if (user.isSuperAdmin || staff) {
          throw new ConflictException({
            code: 'ACCOUNT_DELETION_STAFF',
            message:
              'Staff and owner accounts must be removed by the gym. Contact your gym administrator.',
          });
        }
        await tx.user.update({
          where: { id: userId },
          data: {
            email: `deleted+${userId}@deleted.fit.local`,
            name: null,
            phone: null,
            passwordHash: null,
            googleId: null,
            appleId: null,
            emailVerifiedAt: null,
            tokenVersion: { increment: 1 },
          },
        });
        await tx.gymCredential.deleteMany({ where: { userId } });
        await tx.refreshToken.deleteMany({ where: { userId } });
        await tx.pushToken.deleteMany({ where: { userId } });
        await tx.cart.deleteMany({ where: { userId } });
        await tx.notificationPreference.deleteMany({ where: { userId } });
        // The billing worker already honours this flag at the paid period's end.
        await tx.subscription.updateMany({
          where: { member: { userId }, status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE', 'FROZEN'] } },
          data: { cancelAtPeriodEnd: true },
        });
        await tx.gymMember.updateMany({
          where: { userId },
          data: {
            deletedAt: new Date(),
            photoUrl: null,
            dateOfBirth: null,
            gender: null,
            address: null,
            emergencyContactName: null,
            emergencyContactPhone: null,
            medicalNotes: null,
            personalId: null,
            tags: [],
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
