import {
  ConflictException,
  ForbiddenException,
  type HttpException,
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
  gymSettingsStoredSchema,
  type FreezeSubscriptionData,
  type FreezeSubscriptionResponse,
  type UnfreezeSubscriptionResponse,
} from '@fit/types';
import { Prisma } from '@fit/db';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** The interactive-transaction client the extended tenant client hands to a
 * `$transaction` callback — the full model surface minus the session-management
 * methods Prisma forbids inside a transaction, so a helper can run on the same tx.
 * Mirrors the alias in `reviews.service.ts`. */
type ScopedTransactionClient = Omit<
  TenantPrismaService['client'],
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

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
 * Each mutation is a single interactive transaction, which keeps the status change
 * and everything written alongside it all-or-nothing. It does **not** by itself make
 * the read of `freezeDaysUsed` safe against a concurrent freeze — READ COMMITTED
 * takes no lock on a row merely read — so the allowance is claimed inside the
 * `UPDATE` that spends it (see {@link freezeWhere} and
 * `docs/adr/atomic-counters.md`).
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
   * `remainingDays` when the request would overrun the plan's allowance. Losing a
   * race to a concurrent freeze produces one of those same four, never a new one —
   * see {@link freezeClaimLost}.
   */
  async freeze(id: string, input: FreezeSubscriptionData): Promise<FreezeSubscriptionResponse> {
    const memberId = await this.requireCallerMembership();
    return this.freezeWhere({ id, memberId }, input);
  }

  /**
   * Freeze a **specific member's** subscription from the staff console
   * (`POST /admin/subscriptions/:id/freeze`). Unlike {@link freeze} it does not pin
   * the subscription to the caller's own membership — a staff operator acts on the
   * member — but the tenant-scoped Prisma client still constrains `id` to the
   * caller's gym, so a cross-tenant id is a `404`. Shares the freeze legality /
   * allowance failure modes of {@link freeze}.
   */
  async freezeForStaff(
    id: string,
    input: FreezeSubscriptionData,
  ): Promise<FreezeSubscriptionResponse> {
    return this.freezeWhere({ id }, input);
  }

  /**
   * Resume a **specific member's** frozen subscription from the staff console
   * (`POST /admin/subscriptions/:id/unfreeze`). The staff counterpart to
   * {@link unfreeze}; scoping is by the tenant-constrained `id` alone (see
   * {@link freezeForStaff}).
   */
  async unfreezeForStaff(id: string): Promise<UnfreezeSubscriptionResponse> {
    return this.unfreezeWhere({ id });
  }

  /**
   * Core freeze transaction, parameterised by the `where` that identifies the
   * subscription: `{ id, memberId }` for a member acting on their own membership,
   * `{ id }` for a staff operator (both tenant-scoped by the Prisma extension).
   */
  private async freezeWhere(
    where: Prisma.SubscriptionWhereInput,
    input: FreezeSubscriptionData,
  ): Promise<FreezeSubscriptionResponse> {
    return this.prisma.client.$transaction(async (tx) => {
      const subscription = await tx.subscription.findFirst({
        where,
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
      // touching any policy.
      const nextStatus = this.transition(subscription.status, 'FREEZE');

      // Gym-level freeze policy (T12.16): a single freeze must fall within the
      // gym's configured min/max length. Both bounds are opt-in — `0` means "no
      // limit at that end" — so an unconfigured gym imposes nothing here and the
      // plan's own allowance (below) remains the only cap. The gym is pinned to the
      // caller's tenant, so the policy read is always the caller's own.
      const gym = await tx.gym.findFirst({
        where: { id: this.tenant.gymId },
        select: { settings: true },
      });
      const { minFreezeDays, maxFreezeDays } = gymSettingsStoredSchema.parse(
        gym?.settings ?? {},
      ).freeze;
      if (minFreezeDays > 0 && input.durationDays < minFreezeDays) {
        throw new UnprocessableEntityException({
          message: `A freeze must be at least ${minFreezeDays} day(s)`,
          code: 'BELOW_MIN_FREEZE_DAYS',
          minFreezeDays,
        });
      }
      if (maxFreezeDays > 0 && input.durationDays > maxFreezeDays) {
        throw new UnprocessableEntityException({
          message: `A freeze may be at most ${maxFreezeDays} day(s)`,
          code: 'EXCEEDS_MAX_FREEZE_DAYS',
          maxFreezeDays,
        });
      }

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

      // Claim the days rather than write back `used + durationDays`
      // (docs/adr/atomic-counters.md). The allowance check above cannot be the
      // guard: under READ COMMITTED two freeze requests both read the same
      // `freezeDaysUsed`, both find room, and the second write overwrites the
      // first — a member freezes past the plan's cap and both requests are told
      // they succeeded. So the cap is restated *inside* the statement, as "there
      // is still room for `durationDays`", and the database evaluates it against
      // the live row. `status` is pinned to the one the state machine just judged
      // freezable, so a request that lost the race to a concurrent freeze cannot
      // freeze an already-frozen subscription a second time.
      //
      // The pre-check is kept: it produces the friendly `remainingDays` for the
      // ordinary (uncontended) rejection, and it is what refuses a non-positive
      // duration — a bound the `lte` predicate alone would happily admit.
      const claimed = await tx.subscription.updateMany({
        where: {
          id: subscription.id,
          status: subscription.status,
          freezeDaysUsed: { lte: freezeDaysPerPeriod - input.durationDays },
        },
        data: {
          status: nextStatus,
          frozenAt: startDate,
          frozenUntil: frozenUntilDate,
          freezeDaysUsed: { increment: input.durationDays },
        },
      });
      if (claimed.count === 0) {
        throw await this.freezeClaimLost(tx, subscription.id, freezeDaysPerPeriod);
      }

      return { frozenUntil: frozenUntilDate.toISOString() };
    });
  }

  /**
   * Explain a freeze claim that did not land. `count === 0` is a normal outcome,
   * not an error to swallow: the freeze is **refused**, and the caller is told why
   * in the same vocabulary the uncontended path uses, so no client learns a new
   * failure mode from losing a race.
   *
   * The row is re-read to say which of the claim's predicates failed. That read is
   * accurate by construction: the claim can only have matched nothing because the
   * competing writer already committed (had it still been open, our `updateMany`
   * would have blocked on its row lock rather than returning), so this statement's
   * fresh snapshot sees the state that beat us.
   *
   * - gone → `404 SUBSCRIPTION_NOT_FOUND` (the row was deleted mid-flight);
   * - now `FROZEN` → `409 ALREADY_FROZEN`, same as arriving second;
   * - some other state → `409 SUBSCRIPTION_NOT_FREEZABLE`, as if the state machine
   *   had seen that status;
   * - otherwise the allowance was spent → `422 EXCEEDS_FREEZE_ALLOWANCE` carrying
   *   the *recomputed* `remainingDays`, which is the honest figure now.
   */
  private async freezeClaimLost(
    tx: ScopedTransactionClient,
    id: string,
    freezeDaysPerPeriod: number,
  ): Promise<HttpException> {
    const current = await tx.subscription.findFirst({
      where: { id },
      select: { status: true, freezeDaysUsed: true },
    });
    if (!current) {
      return this.subscriptionNotFound();
    }
    if (current.status === SubscriptionStatus.FROZEN) {
      return new ConflictException({
        message: 'This subscription is already frozen',
        code: 'ALREADY_FROZEN',
      });
    }
    try {
      applyEvent(current.status, 'FREEZE');
    } catch (error) {
      if (error instanceof InvalidSubscriptionTransitionError) {
        return new ConflictException({
          message: `A subscription in "${current.status}" cannot be frozen`,
          code: 'SUBSCRIPTION_NOT_FREEZABLE',
        });
      }
      throw error;
    }
    const remainingDays = Math.max(0, freezeDaysPerPeriod - current.freezeDaysUsed);
    return new UnprocessableEntityException({
      message: `This freeze exceeds the plan's allowance; ${remainingDays} day(s) remain this period`,
      code: 'EXCEEDS_FREEZE_ALLOWANCE',
      remainingDays,
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
    return this.unfreezeWhere({ id, memberId });
  }

  /**
   * Core unfreeze transaction, parameterised by the `where` that identifies the
   * subscription (see {@link freezeWhere}).
   */
  private async unfreezeWhere(
    where: Prisma.SubscriptionWhereInput,
  ): Promise<UnfreezeSubscriptionResponse> {
    return this.prisma.client.$transaction(async (tx) => {
      const subscription = await tx.subscription.findFirst({
        where,
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
