import { Role, TrainerStatus } from '@fit/db';

/**
 * The narrow model surface {@link syncTrainerProfile} needs.
 *
 * Hand-written rather than `Prisma.TransactionClient` for the reason
 * `PromoTransactionClient` and `CreditPackTransactionClient` are: the tenant-
 * **extended** client is not assignable to Prisma's own transaction type, and
 * this function has to run on both - the tenant-scoped client inside
 * `StaffService`, and the plain one inside auth's invite redemption, which
 * happens before any tenant context exists.
 */
export interface TrainerSyncClient {
  trainer: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<{ id: string }>;
  };
  gymMember: {
    findFirst(args: unknown): Promise<{
      firstName: string | null;
      lastName: string | null;
      user: { name: string | null };
    } | null>;
  };
}

/**
 * Bring a staff member's coach profile in line with the role they now hold.
 *
 * Becoming a `TRAINER` creates the profile (or reactivates the one they had
 * before), because a class can only be assigned to a `Trainer` row - without
 * this a gym could put someone on the roster as a coach and then not find them
 * in the class trainer picker. Losing the role deactivates the profile rather
 * than deleting it: the classes they already taught still reference it, and
 * re-promoting them later should restore the same coach, ratings and reviews
 * included.
 *
 * This lives outside `StaffService` because there are two ways to become a coach
 * and only one of them went through that service. A staff invite accepted with
 * `role: TRAINER` is redeemed during auth, on the unscoped client, with the gym
 * taken from the invite - so it could not call a private method that reads a
 * tenant context, and it silently created no profile at all. That is why `gymId`
 * is an argument here rather than something the function looks up.
 */
export async function syncTrainerProfile(
  db: TrainerSyncClient,
  { gymId, memberId, role }: { gymId: string; memberId: string; role: Role },
): Promise<void> {
  const existing = await db.trainer.findFirst({
    where: { staffId: memberId },
    select: { id: true },
  });

  if (role !== Role.TRAINER) {
    if (existing) {
      await db.trainer.update({
        where: { id: existing.id },
        data: { status: TrainerStatus.INACTIVE },
      });
    }
    return;
  }

  if (existing) {
    await db.trainer.update({
      where: { id: existing.id },
      data: { status: TrainerStatus.ACTIVE },
    });
    return;
  }

  const member = await db.gymMember.findFirst({
    where: { id: memberId },
    select: { firstName: true, lastName: true, user: { select: { name: true } } },
  });
  if (!member) {
    return;
  }
  const name =
    [member.firstName, member.lastName]
      .map((part) => part?.trim() ?? '')
      .filter(Boolean)
      .join(' ') ||
    member.user.name?.trim() ||
    'Trainer';

  await db.trainer.create({
    data: { gymId, name, staffId: memberId },
    select: { id: true },
  });
}
