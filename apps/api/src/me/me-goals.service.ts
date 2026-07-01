import { ForbiddenException, Injectable } from '@nestjs/common';
import type { ListMeGoalsResponse, MeGoal, PutMeGoalsInput } from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** Map a Prisma `MemberGoal` row to the wire shape. */
function toGoal(row: {
  id: string;
  label: string;
  current: number;
  target: number;
  unit: string;
}): MeGoal {
  return { id: row.id, label: row.label, current: row.current, target: row.target, unit: row.unit };
}

/**
 * The calling member's training goals (`GET / PUT /me/goals`).
 *
 * Goals are owned by the member and tenant-scoped by `gymId`. Reads/writes pin to
 * the caller's resolved gym membership; `PUT` replaces the whole set in one
 * transaction (delete-then-create), preserving the submitted order via `position`.
 * `MemberGoal` is not in the tenant extension's auto-scope set (like the other
 * member-billing models), so `gymId` is stamped explicitly on create.
 */
@Injectable()
export class MeGoalsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private async requireMemberId(): Promise<string> {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new ForbiddenException({
        message: 'A member session is required',
        code: 'MEMBER_SESSION_REQUIRED',
      });
    }
    const member = await this.prisma.client.gymMember.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!member) {
      throw new ForbiddenException({
        message: 'You are not a member of this gym',
        code: 'NOT_A_MEMBER',
      });
    }
    return member.id;
  }

  /** The caller's goals, in display order. */
  async listMyGoals(): Promise<ListMeGoalsResponse> {
    const memberId = await this.requireMemberId();
    const goals = await this.prisma.client.memberGoal.findMany({
      where: { memberId },
      orderBy: { position: 'asc' },
    });
    return { goals: goals.map(toGoal) };
  }

  /** Replace the caller's whole goal set, returning the new list. */
  async replaceMyGoals(input: PutMeGoalsInput): Promise<ListMeGoalsResponse> {
    const memberId = await this.requireMemberId();
    const gymId = this.tenant.gymId;

    const goals = await this.prisma.client.$transaction(async (tx) => {
      await tx.memberGoal.deleteMany({ where: { memberId } });
      if (input.goals.length > 0) {
        await tx.memberGoal.createMany({
          data: input.goals.map((goal, index) => ({
            gymId,
            memberId,
            label: goal.label,
            current: goal.current,
            target: goal.target,
            unit: goal.unit,
            position: index,
          })),
        });
      }
      return tx.memberGoal.findMany({ where: { memberId }, orderBy: { position: 'asc' } });
    });

    return { goals: goals.map(toGoal) };
  }
}
