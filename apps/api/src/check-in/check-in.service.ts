import { Injectable, NotFoundException } from '@nestjs/common';
import { CheckInMethod, Prisma, Role, SubscriptionStatus } from '@fit/db';
import type {
  ActivityEvent,
  CheckInRow,
  CheckInStatsResponse,
  EligibilityStatus,
  MemberEligibility,
  RecordCheckInInput,
  RecordCheckInResponse,
  TodayCheckInsResponse,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { ActivityStreamService } from '../live/activity-stream.service';

/**
 * The identity fields the arrivals feed / eligibility card select off a
 * `GymMember`, joined to the (cross-tenant) `User`. Kept narrow on purpose — the
 * reception endpoints only need the member's display name + email, never the PII
 * the `User` row also carries (`passwordHash`, OAuth subject ids, tokens).
 */
const MEMBER_IDENTITY_SELECT = {
  id: true,
  status: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.GymMemberSelect;

type MemberIdentity = Prisma.GymMemberGetPayload<{ select: typeof MEMBER_IDENTITY_SELECT }>;

/** A queried check-in joined to its member's identity, as the feed renders it. */
type CheckInRecord = Prisma.CheckInGetPayload<{
  select: {
    id: true;
    gymMemberId: true;
    method: true;
    checkedInAt: true;
    member: { select: typeof MEMBER_IDENTITY_SELECT };
  };
}>;

/**
 * Staff-console reception (check-in) management for a gym (T4.12).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}. `CheckIn` is a new
 * `gymId`-carrying model that is deliberately *not* in the tenant extension's
 * auto-scope set (like the other member-owned models — see `MeGoalsService`), so
 * every query pins the tenant explicitly: reads carry `gymId` in their `where`,
 * and the create stamps `gymId` from the request's tenant context. The member
 * lookups reuse the same `GymMember` model the roster does, auto-scoped by the
 * extension, so a receptionist can only ever check in — or read the standing of —
 * their own gym's members; there is no `gymId` on the wire.
 *
 * Eligibility is derived from the member's gym-membership standing plus their most
 * recent subscription: an active membership with a live (or period-current)
 * subscription is `ACTIVE`, a frozen subscription is `FROZEN`, and anything else
 * (suspended, lapsed, canceled, or never subscribed) is `EXPIRED`. Staff may
 * record an arrival regardless of eligibility — the status only drives the card's
 * warning colour.
 */
@Injectable()
export class CheckInService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly activityStream: ActivityStreamService,
  ) {}

  /**
   * Record one member's arrival (`POST /admin/check-ins`). The member id must
   * resolve to a `MEMBER`-role membership in the caller's gym (the scoped lookup
   * makes a cross-tenant id a `404`); `gymId` is stamped from the tenant context.
   * Returns the created row plus the member's eligibility at check-in time so the
   * reception UI can confirm the arrival and surface an access warning in one call.
   */
  async recordCheckIn(input: RecordCheckInInput): Promise<RecordCheckInResponse> {
    const member = await this.requireMember(input.gymMemberId);

    const created = await this.prisma.client.checkIn.create({
      data: {
        gymId: this.tenant.gymId,
        gymMemberId: member.id,
        method: input.method === 'QR' ? CheckInMethod.QR : CheckInMethod.MANUAL,
      },
      select: {
        id: true,
        gymMemberId: true,
        method: true,
        checkedInAt: true,
        member: { select: MEMBER_IDENTITY_SELECT },
      },
    });

    // Push the arrival onto the live activity stream (T8.9) so the reception board
    // and activity feed update without polling. Best-effort and fire-and-forget:
    // `publish` swallows a Redis outage internally, and the trailing `.catch` is a
    // belt-and-braces guard, so a live-stream hiccup can never fail the check-in
    // the receptionist just recorded — the client's poll catches the row up.
    void this.activityStream
      .publish(this.tenant.gymId, this.toActivityEvent(created))
      .catch(() => undefined);

    return {
      checkIn: this.toRow(created),
      eligibility: await this.buildEligibility(member),
    };
  }

  /**
   * Today's arrivals (`GET /admin/check-ins/today`), most recent first — the live
   * reception feed. Bounded to the current calendar day in the server's zone and
   * explicitly tenant-scoped; an empty day is a normal result.
   */
  async listToday(): Promise<TodayCheckInsResponse> {
    const rows = await this.prisma.client.checkIn.findMany({
      where: { gymId: this.tenant.gymId, checkedInAt: { gte: startOfToday() } },
      orderBy: { checkedInAt: 'desc' },
      select: {
        id: true,
        gymMemberId: true,
        method: true,
        checkedInAt: true,
        member: { select: MEMBER_IDENTITY_SELECT },
      },
    });
    return { checkIns: rows.map((row) => this.toRow(row)) };
  }

  /**
   * The reception KPI snapshot (`GET /admin/check-ins/stats`). All figures are
   * "today", scoped to the caller's gym: total arrivals, members on-site now
   * (kept simple — today's distinct arrivals, since there is no checkout event
   * yet), the busiest single hour's arrival count, and no-shows (0 until an
   * expected-attendance source exists). The distinct + peak figures derive from
   * the day's arrival timestamps in one pass, so this is a single scoped query.
   */
  async getStats(): Promise<CheckInStatsResponse> {
    const rows = await this.prisma.client.checkIn.findMany({
      where: { gymId: this.tenant.gymId, checkedInAt: { gte: startOfToday() } },
      select: { gymMemberId: true, checkedInAt: true },
    });

    const distinctMembers = new Set<string>();
    const perHour = new Map<number, number>();
    for (const row of rows) {
      distinctMembers.add(row.gymMemberId);
      const hour = row.checkedInAt.getHours();
      perHour.set(hour, (perHour.get(hour) ?? 0) + 1);
    }
    const peakToday = perHour.size === 0 ? 0 : Math.max(...perHour.values());

    return {
      checkedInToday: rows.length,
      inGymNow: distinctMembers.size,
      peakToday,
      // No expected-attendance source yet (bookings-driven, Phase 5/6); the field
      // is on the contract so the card renders without a later change.
      noShowsToday: 0,
    };
  }

  /**
   * One member's current eligibility for the manual-lookup card
   * (`GET /admin/check-ins/eligibility`). The member id must resolve to a
   * `MEMBER`-role membership in the caller's gym (a cross-tenant id is a `404`).
   */
  async getEligibility(gymMemberId: string): Promise<MemberEligibility> {
    const member = await this.requireMember(gymMemberId);
    return this.buildEligibility(member);
  }

  /**
   * Resolve a `MEMBER`-role membership in the caller's gym or throw a
   * `404 MEMBER_NOT_FOUND`. `GymMember` is auto-scoped by the tenant extension, so
   * a cross-tenant id simply never matches — the guard for every reception action.
   */
  private async requireMember(id: string): Promise<MemberIdentity> {
    const member = await this.prisma.client.gymMember.findFirst({
      where: { id, role: Role.MEMBER },
      select: MEMBER_IDENTITY_SELECT,
    });
    if (!member) {
      throw new NotFoundException({ message: 'Member not found', code: 'MEMBER_NOT_FOUND' });
    }
    return member;
  }

  /**
   * Derive a member's eligibility from their membership standing + most recent
   * subscription. A suspended membership is always `EXPIRED`; otherwise the newest
   * subscription decides — `ACTIVE`/`PAST_DUE` within its current period is
   * `ACTIVE`, `FROZEN` is `FROZEN`, and a canceled/expired/absent one is `EXPIRED`.
   */
  private async buildEligibility(member: MemberIdentity): Promise<MemberEligibility> {
    const base = {
      gymMemberId: member.id,
      name: member.user.name ?? member.user.email,
      email: member.user.email,
    };

    if (member.status !== 'ACTIVE') {
      return { ...base, status: 'EXPIRED', planName: null };
    }

    const subscription = await this.prisma.client.subscription.findFirst({
      where: { gymId: this.tenant.gymId, memberId: member.id },
      orderBy: { currentPeriodEnd: 'desc' },
      select: { status: true, currentPeriodEnd: true, plan: { select: { name: true } } },
    });

    if (!subscription) {
      return { ...base, status: 'EXPIRED', planName: null };
    }

    return {
      ...base,
      status: eligibilityFromSubscription(subscription.status, subscription.currentPeriodEnd),
      planName: subscription.plan?.name ?? null,
    };
  }

  /**
   * Project a just-recorded check-in onto the unified {@link ActivityEvent} the
   * live stream (T8.9) broadcasts. Kept byte-identical to the `checkin` projection
   * the paginated `GET /admin/activity` feed emits — same composite `checkin:<id>`
   * id, title, and `QR scan` / `Front desk` detail — so a live row and a later
   * polled row of the same arrival are indistinguishable to the client.
   */
  private toActivityEvent(row: CheckInRecord): ActivityEvent {
    return {
      id: `checkin:${row.id}`,
      type: 'checkin',
      title: 'Checked in',
      detail: row.method === CheckInMethod.QR ? 'QR scan' : 'Front desk',
      memberId: row.gymMemberId,
      memberName: row.member.user.name ?? row.member.user.email,
      amount: null,
      currency: null,
      at: row.checkedInAt.toISOString(),
    };
  }

  /** Project a queried check-in onto the denormalised wire {@link CheckInRow}. */
  private toRow(row: CheckInRecord): CheckInRow {
    return {
      id: row.id,
      gymMemberId: row.gymMemberId,
      name: row.member.user.name ?? row.member.user.email,
      // No member-avatar source yet; the field is on the contract for a later API.
      photoUrl: null,
      method: row.method === CheckInMethod.QR ? 'QR' : 'MANUAL',
      checkedInAt: row.checkedInAt.toISOString(),
    };
  }
}

/** Start of the current calendar day in the server's zone — the "today" bound. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Map a subscription's status (+ period end) onto a member's access standing. A
 * live `TRIAL`/`ACTIVE`/`PAST_DUE` subscription still within its current period is
 * `ACTIVE` (a free trial grants full access during its introductory window); a
 * `FROZEN` one is `FROZEN`; anything canceled, expired, or lapsed past its period
 * end is `EXPIRED`.
 */
function eligibilityFromSubscription(
  status: SubscriptionStatus,
  currentPeriodEnd: Date,
): EligibilityStatus {
  if (status === SubscriptionStatus.FROZEN) {
    return 'FROZEN';
  }
  const live =
    status === SubscriptionStatus.TRIAL ||
    status === SubscriptionStatus.ACTIVE ||
    status === SubscriptionStatus.PAST_DUE;
  if (live && currentPeriodEnd.getTime() >= Date.now()) {
    return 'ACTIVE';
  }
  return 'EXPIRED';
}
