import { Injectable, NotFoundException } from '@nestjs/common';
import { CheckInMethod, Prisma, Role, SubscriptionStatus } from '@fit/db';
import type {
  ActivityEvent,
  CheckInRow,
  CheckInStatsQuery,
  CheckInStatsResponse,
  EligibilityStatus,
  ListTodayCheckInsQuery,
  MemberEligibility,
  RecordCheckInInput,
  RecordCheckInResponse,
  TodayCheckInsResponse,
} from '@fit/types';
import { atLocation } from '../common/location-filter.util';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { ActivityStreamService } from '../live/activity-stream.service';
import { LoyaltyPointsService } from '../loyalty/loyalty-points.service';

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

/**
 * What every check-in read/write selects: the row, its member's identity, and the
 * ONE hop to the branch's name for {@link CheckInRow.locationName}. Declared once
 * so the create, the feed and any later reader project identically — three copies
 * of a select is how a row ends up carrying a branch on one endpoint and not the
 * other.
 */
const CHECK_IN_ROW_SELECT = {
  id: true,
  gymMemberId: true,
  method: true,
  checkedInAt: true,
  member: { select: MEMBER_IDENTITY_SELECT },
  location: { select: { name: true } },
} satisfies Prisma.CheckInSelect;

/** A queried check-in joined to its member's identity, as the feed renders it. */
type CheckInRecord = Prisma.CheckInGetPayload<{ select: typeof CHECK_IN_ROW_SELECT }>;

/**
 * Staff-console reception (check-in) management for a gym (T4.12).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}. `CheckIn` joined the
 * extension's `TENANT_SCOPED_MODELS` in Stage 3 of the multi-branch roadmap, so
 * `gymId` is now injected into every `where` and stamped on every create
 * automatically; the explicit `gymId` this file still passes is redundant
 * belt-and-braces rather than the load-bearing guard it used to be. The member and
 * location lookups are auto-scoped the same way, so a receptionist can only ever
 * check in — or read the standing of — their own gym's members, at their own gym's
 * branches; there is no `gymId` on the wire.
 *
 * **Two location concepts meet here and must not be conflated.** A `CheckIn`'s
 * `locationId` is the branch the member physically WALKED INTO — an event at a
 * place. `GymMember.locationId` is their home branch — a property of the person. A
 * drop-in makes the two differ, which is exactly why the arrival records its own:
 * defaulting a visit's branch off the member's home branch would invent a visit
 * that did not happen, so the fallback for an unstated branch is the gym's default
 * (see {@link CheckInService.resolveArrivalBranch}) and never the member's.
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
    private readonly loyalty: LoyaltyPointsService,
  ) {}

  /**
   * Record one member's arrival (`POST /admin/check-ins`). The member id must
   * resolve to a `MEMBER`-role membership in the caller's gym (the scoped lookup
   * makes a cross-tenant id a `404`); `gymId` is stamped from the tenant context.
   * Returns the created row plus the member's eligibility at check-in time so the
   * reception UI can confirm the arrival and surface an access warning in one call.
   *
   * The arrival is stamped with the branch it happened at — the one the body named,
   * or the gym's default when it named none (see
   * {@link CheckInService.resolveArrivalBranch}). A check-in with no branch is the
   * hole Stage 3 exists to close, so the fallback is the default branch and never
   * `null`.
   */
  async recordCheckIn(input: RecordCheckInInput): Promise<RecordCheckInResponse> {
    const member = await this.requireMember(input.gymMemberId);
    // Resolved before the create so a bad branch fails without having written an
    // arrival, and so the failure names the branch rather than a foreign key.
    const locationId = await this.resolveArrivalBranch(input.locationId);

    const created = await this.prisma.client.checkIn.create({
      data: {
        gymId: this.tenant.gymId,
        gymMemberId: member.id,
        method: input.method === 'QR' ? CheckInMethod.QR : CheckInMethod.MANUAL,
        locationId,
      },
      select: CHECK_IN_ROW_SELECT,
    });

    // Push the arrival onto the live activity stream (T8.9) so the reception board
    // and activity feed update without polling. Best-effort and fire-and-forget:
    // `publish` swallows a Redis outage internally, and the trailing `.catch` is a
    // belt-and-braces guard, so a live-stream hiccup can never fail the check-in
    // the receptionist just recorded — the client's poll catches the row up.
    void this.activityStream
      .publish(this.tenant.gymId, this.toActivityEvent(created))
      .catch(() => undefined);

    // Award loyalty points for the arrival (T12.10), same best-effort contract as
    // the live-stream publish: the service no-ops when the program is disabled and
    // swallows its own errors, so a loyalty hiccup can never fail the check-in.
    void this.loyalty
      .awardForCheckIn(this.tenant.gymId, created.gymMemberId, created.id)
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
   *
   * `query.locationId` narrows the feed to the people who walked into ONE branch —
   * {@link atLocation} on the check-in's own column, plain equality, served by the
   * `(gymId, locationId, checkedInAt)` composite. Omitted, the desk sees every
   * branch's arrivals and the `(gymId, checkedInAt)` index serves it unchanged.
   */
  async listToday(query: ListTodayCheckInsQuery = {}): Promise<TodayCheckInsResponse> {
    const rows = await this.prisma.client.checkIn.findMany({
      where: {
        gymId: this.tenant.gymId,
        checkedInAt: { gte: startOfToday() },
        ...atLocation(query.locationId),
      },
      orderBy: { checkedInAt: 'desc' },
      select: CHECK_IN_ROW_SELECT,
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
   *
   * `query.locationId` narrows every figure to one branch at once — because all
   * four derive from the same filtered set, `peakToday` is the busiest hour AT that
   * branch rather than the gym's peak hour counted there, and `inGymNow` counts the
   * people on THAT floor. This endpoint also backs the console's sidebar check-in
   * badge, so the branch filter is what lets the badge count one branch's arrivals.
   */
  async getStats(query: CheckInStatsQuery = {}): Promise<CheckInStatsResponse> {
    const rows = await this.prisma.client.checkIn.findMany({
      where: {
        gymId: this.tenant.gymId,
        checkedInAt: { gte: startOfToday() },
        ...atLocation(query.locationId),
      },
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
   * The branch to stamp on an arrival: the one the desk named, or the gym's default
   * (`Location.isDefault`) when it named none.
   *
   * Follows `MembersService.resolveHomeBranch` rather than
   * `AdminScheduleService.requireGymLocation` — the two validate a named branch
   * identically (a `location.findFirst` through the scoped client, so another gym's
   * branch simply never matches and is rejected as unknown rather than leaking its
   * existence), but only the former also answers the question this write actually
   * has: what to store when the caller says nothing. Here that fallback matters
   * more than it does for a member, because `recordCheckInSchema.locationId` is
   * optional and today's callers omit it, so the fallback is the common path rather
   * than the edge.
   *
   * **The fallback is the gym's DEFAULT branch, never the member's home branch.**
   * A check-in records where somebody physically was; deriving that from a property
   * of the person would fabricate a visit to a site they may not have entered, and
   * would quietly make drop-ins invisible at the branch that actually served them.
   * The default branch is a stated approximation; the member's home branch would be
   * a wrong fact.
   *
   * A gym with no default branch yields `null` — the same deliberate degradation
   * `resolveHomeBranch` makes. Every gym is given one by the Stage 0 migration, so
   * this only happens if an operator has since cleared the flag, and a
   * half-configured branch list must not be the reason a front desk cannot check
   * anybody in. The arrival is recorded unattributed and the `NO_LOCATION_LABEL`
   * safety net in reports catches it.
   */
  private async resolveArrivalBranch(locationId: string | undefined): Promise<string | null> {
    if (locationId) {
      const location = await this.prisma.client.location.findFirst({
        where: { id: locationId },
        select: { id: true },
      });
      if (!location) {
        throw new NotFoundException({ message: 'Location not found', code: 'LOCATION_NOT_FOUND' });
      }
      return location.id;
    }

    const fallback = await this.prisma.client.location.findFirst({
      where: { isDefault: true },
      select: { id: true },
    });
    return fallback?.id ?? null;
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
      // The branch walked into, not the member's home branch — `null` only for an
      // arrival whose branch was later deleted (`onDelete: SetNull` keeps the
      // footfall history), which the feed renders as a dash.
      locationName: row.location?.name ?? null,
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
