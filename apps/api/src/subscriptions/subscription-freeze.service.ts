import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DEFAULT_FREEZE_DAYS_PER_PERIOD,
  InvalidSubscriptionTransitionError,
  SubscriptionStatus,
  addDays,
  applyEvent,
  evaluateFreezeAllowance,
  freezeUntil,
  resumeExtensionDays,
} from '@fit/db';
import {
  type FreezeSubscriptionData,
  type FreezeSubscriptionResponse,
  type UnfreezeSubscriptionResponse,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/**
 * Member-facing subscription freeze / pause flow (T8.4).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every `subscription` /
 * `gymMember` query is auto-constrained to the caller's gym by the Prisma tenant
 * extension, and the caller may only act on *their own* subscription — the
 * subscription's `memberId` must equal the caller's resolved gym membership, never a
 * value off the wire (mirroring how {@link BookingsService} books a member for
 * themselves).
 *
 * The flow composes the two halves of the T8.3 / T8.4 subscription domain logic in
 * `@fit/db`, both pure and shared with the recurring-billing job:
 *
 * - **Legality** — every status change funnels through {@link applyEvent}, so an
 *   illegal pause (freezing a `PAST_DUE` / `CANCELED` / `EXPIRED` subscription) is
 *   rejected by the state machine, not re-derived here.
 * - **Policy** — {@link evaluateFreezeAllowance} enforces the plan's
 *   `freezeDaysPerPeriod` cap against the days already committed this period, and
 *   {@link resumeExtensionDays} compensates a resume by pushing `currentPeriodEnd`
 *   out by the days *actually* spent frozen (the full booked duration on an
 *   auto-resume, fewer when the member unfreezes early).
 *
 * Each mutation is a single interactive transaction so the read of the current
 * status / usage and the write that advances it stay consistent under concurrency.
 */
@Injectable()
export class SubscriptionFreezeService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * Freeze (pause) the calling member's subscription from `startDate` for
   * `durationDays`. Sets `status = FROZEN`, stamps `frozenAt` / `frozenUntil`, and
   * commits the requested days against the period's `freezeDaysUsed`. Failure modes:
   * `404 SUBSCRIPTION_NOT_FOUND` (unknown / not the caller's), `409 ALREADY_FROZEN`
   * (already paused), `409 SUBSCRIPTION_NOT_FREEZABLE` (a non-active state the state
   * machine refuses to freeze), and `422 EXCEEDS_FREEZE_ALLOWANCE` carrying
   * `remainingDays` when the request would overrun the plan's allowance.
   */
  async freeze(id: string, input: FreezeSubscriptionData): Promise<FreezeSubscriptionResponse> {
    const memberId = await this.requireCallerMembership();

    return this.prisma.client.$transaction(async (tx) => {
      const subscription = await tx.subscription.findFirst({
        where: { id, memberId },
        select: {
          id: true,
          status: true,
          freezeDaysUsed: true,
          plan: { select: { freezeDaysPerPeriod: true } },
        },
      });
      if (!subscription) {
        throw this.subscriptionNotFound();
      }
      if (subscription.status === SubscriptionStatus.FROZEN) {
        throw new ConflictException({
          message: 'This subscription is already frozen',
          code: 'ALREADY_FROZEN',
        });
      }

      // Legality first: the state machine owns which states may be paused. A
      // PAST_DUE / CANCELED / EXPIRED subscription cannot freeze, so reject before
      // touching the allowance.
      const nextStatus = this.transition(subscription.status, 'FREEZE');

      const freezeDaysPerPeriod =
        subscription.plan?.freezeDaysPerPeriod ?? DEFAULT_FREEZE_DAYS_PER_PERIOD;
      const allowance = evaluateFreezeAllowance({
        freezeDaysPerPeriod,
        freezeDaysUsed: subscription.freezeDaysUsed,
        durationDays: input.durationDays,
      });
      if (!allowance.allowed) {
        throw new UnprocessableEntityException({
          message: `This freeze exceeds the plan's allowance; ${allowance.remainingDays} day(s) remain this period`,
          code: 'EXCEEDS_FREEZE_ALLOWANCE',
          remainingDays: allowance.remainingDays,
        });
      }

      const startDate = new Date(input.startDate);
      const frozenUntilDate = freezeUntil(startDate, input.durationDays);

      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: nextStatus,
          frozenAt: startDate,
          frozenUntil: frozenUntilDate,
          freezeDaysUsed: subscription.freezeDaysUsed + input.durationDays,
        },
      });

      return { frozenUntil: frozenUntilDate.toISOString() };
    });
  }

  /**
   * Resume the calling member's frozen subscription, early or at its scheduled end.
   * Sets `status = ACTIVE`, clears `frozenAt` / `frozenUntil`, and pushes
   * `currentPeriodEnd` out by the days actually spent frozen so the paused-for time
   * is given back. Failure modes: `404 SUBSCRIPTION_NOT_FOUND` and `409 NOT_FROZEN`
   * (the subscription is not currently paused).
   */
  async unfreeze(id: string): Promise<UnfreezeSubscriptionResponse> {
    const memberId = await this.requireCallerMembership();

    return this.prisma.client.$transaction(async (tx) => {
      const subscription = await tx.subscription.findFirst({
        where: { id, memberId },
        select: {
          id: true,
          status: true,
          frozenAt: true,
          frozenUntil: true,
          currentPeriodEnd: true,
        },
      });
      if (!subscription) {
        throw this.subscriptionNotFound();
      }
      if (
        subscription.status !== SubscriptionStatus.FROZEN ||
        !subscription.frozenAt ||
        !subscription.frozenUntil
      ) {
        throw new ConflictException({
          message: 'This subscription is not frozen',
          code: 'NOT_FROZEN',
        });
      }

      const nextStatus = this.transition(subscription.status, 'UNFREEZE');
      const extensionDays = resumeExtensionDays(
        subscription.frozenAt,
        subscription.frozenUntil,
        new Date(),
      );
      const newPeriodEnd = addDays(subscription.currentPeriodEnd, extensionDays);

      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: nextStatus,
          frozenAt: null,
          frozenUntil: null,
          currentPeriodEnd: newPeriodEnd,
        },
      });

      return { newPeriodEnd: newPeriodEnd.toISOString() };
    });
  }

  /**
   * Apply a freeze/unfreeze event through the state machine, mapping its
   * `InvalidSubscriptionTransitionError` to a `409 SUBSCRIPTION_NOT_FREEZABLE` — a
   * subscription in a state the transition is not legal from (e.g. freezing a
   * `PAST_DUE` one). The `ALREADY_FROZEN` / `NOT_FROZEN` cases are caught earlier
   * with their own, more specific codes.
   */
  private transition(status: SubscriptionStatus, event: 'FREEZE' | 'UNFREEZE'): SubscriptionStatus {
    try {
      return applyEvent(status, event);
    } catch (error) {
      if (error instanceof InvalidSubscriptionTransitionError) {
        throw new ConflictException({
          message: `A subscription in "${status}" cannot be ${event === 'FREEZE' ? 'frozen' : 'resumed'}`,
          code: 'SUBSCRIPTION_NOT_FREEZABLE',
        });
      }
      throw error;
    }
  }

  /**
   * Resolve the calling user's membership in the current gym — the subscription's
   * owner. The session must carry a user and that user must be a member of this gym;
   * a non-member is a `403`. Mirrors {@link BookingsService.requireCallerMembership}.
   */
  private async requireCallerMembership(): Promise<string> {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new ForbiddenException({
        message: 'A member session is required to manage a subscription',
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

  /** `404` for an unknown subscription id or one that is not the caller's. */
  private subscriptionNotFound(): NotFoundException {
    return new NotFoundException({
      message: 'Subscription not found',
      code: 'SUBSCRIPTION_NOT_FOUND',
    });
  }
}
