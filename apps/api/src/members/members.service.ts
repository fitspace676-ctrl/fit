import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AutomationTriggerType,
  DEFAULT_FREEZE_DAYS_PER_PERIOD,
  Gender,
  GymMemberStatus,
  InvoiceStatus,
  MemberKind as MemberKindEnum,
  PaymentStatus,
  Prisma,
  Role,
  SubscriptionInterval,
  SubscriptionPlanStatus,
  SubscriptionStatus,
} from '@fit/db';
import type {
  BulkExportMembersInput,
  BulkExportMembersResponse,
  CreateMemberInput,
  CreateMemberNoteInput,
  CreateMemberResponse,
  CreateMemberTaskInput,
  GetMemberResponse,
  ListMembersQuery,
  ListMembersResponse,
  MemberAccessLogEntry,
  MemberActivity,
  MemberAttendanceWeek,
  MemberBillingState,
  MemberKind,
  MemberCurrentPlan,
  MemberDetail,
  MemberNoteEntry,
  MemberPlan,
  MemberPlanMix,
  MemberPurchase,
  MemberRow,
  MemberTabCounts,
  MemberTaskEntry,
  SendMemberEmailInput,
  SendMemberEmailResponse,
  SetMemberStatusResponse,
  UpdateMemberInput,
  UpdateMemberTaskInput,
  UpdateMemberResponse,
} from '@fit/types';
import {
  gymSettingsStoredSchema,
  interpolateMergeFields,
  requiredIntakeFields,
  resolveMemberKind,
} from '@fit/types';
import type { GymLanguage, MemberIntakeField } from '@fit/types';
import { AutomationExecutorService } from '../automation/automation-executor.service';
import { atLocation } from '../common/location-filter.util';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { GymMemberIntakeService } from '../gyms/gym-member-intake.service';
import { LoyaltyPointsService } from '../loyalty/loyalty-points.service';
import { MailerService } from '../mail/mailer.service';
import { renderBrandedEmail, escapeHtml, renderEmailParagraphs } from '../mail/branded-email';
import { resolveEmailLocale } from '../mail/email-locale';
import { emailStrings } from '../mail/email-strings';
import { buildMemberMergeValues } from './member-merge-values';

/** A subscription is "live" (occupies the member's slot) in these states — including
 *  TRIAL, a free trial that still holds the slot before it converts (T5.6). */
const LIVE_SUBSCRIPTION_STATUSES = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.FROZEN,
] as const;

/** The plan-mix / plan-dot swatch palette, shared with the dashboard's plan mix. */
const PLAN_COLORS = ['#7C3AED', '#EC4899', '#2563EB', '#0EA5E9', '#10B981', '#F59E0B'];

const DAY_MS = 24 * 60 * 60 * 1000;
/** How many trailing weeks the detail's attendance chart spans. */
const ATTENDANCE_WEEKS = 8;
/** How many rows each recent-activity source contributes before the merge/cap. */
const ACTIVITY_SOURCE_LIMIT = 8;
/** How many merged activity rows the detail timeline surfaces. */
const ACTIVITY_LIMIT = 12;

/**
 * The live subscription the roster/detail joins onto a member for their plan,
 * next-billing and current-plan panels — the member's single live subscription
 * (at most one by the partial-unique invariant), newest period first as a guard.
 */
const LIVE_SUBSCRIPTION_SELECT = {
  id: true,
  planId: true,
  status: true,
  priceAmount: true,
  currency: true,
  interval: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  frozenUntil: true,
  freezeDaysUsed: true,
  plan: { select: { name: true, freezeDaysPerPeriod: true } },
} satisfies Prisma.SubscriptionSelect;

/**
 * Shape the roster/detail queries select off `GymMember`, joined to the
 * (cross-tenant) `User` for the member's identity plus the member's live
 * `Subscription` (for the plan + next-billing cells) and the latest `CheckIn`
 * (for `lastVisitAt`). Kept narrow on purpose — the member endpoints must never
 * leak PII the table doesn't need (`passwordHash`, OAuth subject ids, tokens),
 * so only `name` / `email` / `phone` are pulled from `User`.
 */
const MEMBER_SELECT = {
  id: true,
  status: true,
  joinedAt: true,
  deletedAt: true,
  dateOfBirth: true,
  startDate: true,
  personalId: true,
  gender: true,
  address: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  medicalNotes: true,
  user: { select: { name: true, email: true, phone: true } },
  kindOverride: true,
  subscriptions: {
    where: { status: { in: [...LIVE_SUBSCRIPTION_STATUSES] } },
    orderBy: { currentPeriodEnd: 'desc' },
    take: 1,
    select: LIVE_SUBSCRIPTION_SELECT,
  },
  // Every subscription this person has ever held, live or not. One number is all
  // the derivation needs, and it is what separates a lapsed member from someone
  // who only ever dropped in — counted here rather than fetched, so the roster
  // does not grow a second query per page.
  _count: { select: { subscriptions: true } },
  checkIns: {
    orderBy: { checkedInAt: 'desc' },
    take: 1,
    select: { checkedInAt: true },
  },
  // Unsettled invoices — summed into the roster's "owes" badge.
  invoices: {
    where: { status: InvoiceStatus.PENDING },
    select: { amount: true, currency: true },
  },
  // The member's home branch, for the roster's LOCATION cell. A one-hop relation
  // select on the page query — Prisma resolves it inside the same `findMany`, so
  // it costs no extra round trip and is not an N+1. Only the name: the roster
  // prints it and nothing more, and selecting the whole `Location` would drag its
  // address, hours and settings JSON across for one string.
  location: { select: { name: true } },
} satisfies Prisma.GymMemberSelect;

type MemberRecord = Prisma.GymMemberGetPayload<{ select: typeof MEMBER_SELECT }>;
type LiveSubscription = MemberRecord['subscriptions'][number];

/**
 * Staff-console member management for a gym (read + write, T4.2 + T4.3), reskinned
 * to the Planflow "formacore" reference.
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every query is
 * auto-constrained to (and, on create, stamped with) the caller's gym by the
 * Prisma tenant extension, so a staff member can only ever read or mutate their
 * own gym's members — there is no `gymId` to pass or to forget. The roster is the
 * gym's `MEMBER`-role memberships (staff are managed separately in T4.7),
 * paginated server-side. `User` is cross-tenant, so create links an existing
 * person by email rather than duplicating them.
 *
 * Every "formacore" figure is a REAL tenant-scoped query: each row's `plan` +
 * `nextBilling` come from the member's live `Subscription`, `lastVisitAt` from the
 * latest `CheckIn`; the gym-wide `planMix` / tab `counts` are aggregates; the
 * detail adds `lifetimeValue` (SUM captured `Payment`), `totalVisits` (`CheckIn`
 * count), `currentPlan` (live subscription + days-remaining), `recentActivity`
 * (merged recent check-ins / bookings / payments), and `attendance8w` (per-week
 * check-ins). The detail also carries the member's `purchases` (POS `Order`s),
 * `accessLog` (`CheckIn`s), the profile extras (DOB / gender / address /
 * emergency contact / medical notes), and the member's staff `notes`
 * (`MemberNote`) and follow-up `tasks` (`MemberTask`). Every figure is a REAL
 * tenant-scoped query — never fabricated.
 */

/**
 * The `where` fragment that selects one {@link MemberKind}, mirroring
 * `resolveMemberKind` in SQL.
 *
 * The two must agree: a row the derivation calls a guest has to be a row this
 * clause matches, or a tab would show a count its own list cannot reproduce.
 * Each kind is therefore "pinned to it, OR unpinned and deriving to it", in the
 * same precedence the function uses — the override first, then suspension, then
 * whether a subscription is live, then whether one ever was.
 */
function memberKindWhere(kind: MemberKind): Prisma.GymMemberWhereInput {
  const live = { some: { status: { in: [...LIVE_SUBSCRIPTION_STATUSES] } } };

  if (kind === 'MEMBER') {
    return {
      OR: [
        { kindOverride: MemberKindEnum.MEMBER },
        {
          kindOverride: null,
          status: { not: GymMemberStatus.SUSPENDED },
          subscriptions: live,
        },
      ],
    };
  }

  if (kind === 'GUEST') {
    return {
      OR: [
        { kindOverride: MemberKindEnum.GUEST },
        {
          kindOverride: null,
          status: { not: GymMemberStatus.SUSPENDED },
          subscriptions: { none: {} },
        },
      ],
    };
  }

  // Lapsed: suspended outright, or holding subscriptions of which none is live.
  return {
    OR: [
      { kindOverride: MemberKindEnum.INACTIVE },
      { kindOverride: null, status: GymMemberStatus.SUSPENDED },
      {
        kindOverride: null,
        subscriptions: { some: {} },
        NOT: { subscriptions: live },
      },
    ],
  };
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly automation: AutomationExecutorService,
    private readonly loyalty: LoyaltyPointsService,
    private readonly mailer: MailerService,
    private readonly intake: GymMemberIntakeService,
  ) {}

  /**
   * One page of the gym's members, filtered + sorted server-side, plus the
   * gym-wide `planMix` + tab `counts` the "formacore" header renders. `total` is
   * the filtered count (so the pager is accurate), and the page is bounded by
   * `skip`/`take` — the full roster is never loaded into memory. An empty page is
   * a normal result. All aggregations run concurrently.
   */
  async listMembers(query: ListMembersQuery): Promise<ListMembersResponse> {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;

    const [rows, total, planMix, counts] = await Promise.all([
      this.prisma.client.gymMember.findMany({
        where,
        select: MEMBER_SELECT,
        orderBy: this.buildOrderBy(query),
        skip,
        take: query.limit,
      }),
      this.prisma.client.gymMember.count({ where }),
      this.planMix(query.locationId),
      this.tabCounts(query.locationId),
    ]);

    return {
      data: rows.map((row) => this.toRow(row)),
      total,
      page: query.page,
      limit: query.limit,
      planMix,
      counts,
    };
  }

  /**
   * One member's detail for the tabbed detail page. A missing id — or one
   * belonging to another tenant (the scoped `where` already constrains `gymId`,
   * so a cross-tenant id simply never matches) — is a `404`. Assembles the
   * "formacore" KPIs / timeline / attendance from real tenant-scoped queries.
   */
  async getMember(id: string): Promise<GetMemberResponse> {
    const row = await this.prisma.client.gymMember.findFirst({
      where: { id, role: Role.MEMBER },
      select: MEMBER_SELECT,
    });
    if (!row) {
      throw new NotFoundException({ message: 'Member not found', code: 'MEMBER_NOT_FOUND' });
    }

    return this.buildDetail(row);
  }

  /**
   * Create a member (T4.3). The email is the cross-gym {@link Role.MEMBER User}
   * identity: a person who already exists (a member of another gym, or one who
   * was removed and is returning) is **linked** rather than duplicated — only a
   * brand-new email mints a `User`. A duplicate within the caller's own gym is a
   * `409 MEMBER_EXISTS`. Wrapped in a transaction so a failed membership insert
   * never leaves an orphan user behind. Returns the new member's detail (`201`).
   *
   * The whole flow runs on the tenant-scoped client: `gymMember` reads/writes are
   * auto-constrained to (and stamped with) the caller's gym, so there is no
   * `gymId` to pass — the duplicate check and the insert are both this-gym-only by
   * construction. An existing user's `name`/`phone` is left untouched (it is their
   * cross-gym identity); edit it afterwards via {@link updateMember} if needed.
   */
  async createMember(input: CreateMemberInput): Promise<CreateMemberResponse> {
    const { name, email, phone, status, planId, startDate, locationId } = input;

    await this.assertIntakeSatisfied(input);

    // Resolved before the transaction so a bad branch fails fast, without having
    // opened one — and so the fallback lookup is not repeated per retry.
    const homeLocationId = await this.resolveHomeBranch(locationId);

    const created = await this.prisma.client.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });

      if (existing) {
        const already = await tx.gymMember.findFirst({
          where: { userId: existing.id },
          select: { id: true, deletedAt: true },
        });
        if (already) {
          // A trashed prior membership occupies the `@@unique([userId, gymId])`
          // slot — re-adding would collide, so steer staff to restore instead
          // (the response carries the member id the client links to).
          if (already.deletedAt) {
            throw new ConflictException({
              message: 'This person is in your gym’s trash — restore them instead of re-adding.',
              code: 'MEMBER_TRASHED',
              memberId: already.id,
            });
          }
          throw new ConflictException({
            message: 'This person is already a member of your gym',
            code: 'MEMBER_EXISTS',
          });
        }
      }

      const userId =
        existing?.id ??
        (await tx.user.create({ data: { name, email, phone }, select: { id: true } })).id;

      // `gymId` is read from the request's tenant context. The tenant extension
      // also stamps it on create, so this is belt-and-braces — and it satisfies
      // the create input's static type (which always requires `gymId`).
      const member = await tx.gymMember.create({
        data: {
          userId,
          gymId: this.tenant.gymId,
          role: Role.MEMBER,
          status,
          locationId: homeLocationId,
          ...this.profileWriteData(input),
        },
        select: { id: true },
      });

      // Optional plan enrolment (parity with the reference Add-Member form): a
      // staff-recorded ACTIVE subscription snapshotting the catalogue plan's
      // price/interval, no payment taken. A brand-new member holds no live
      // subscription, so the partial-unique "one live sub per member" is safe.
      if (planId) {
        const plan = await tx.subscriptionPlan.findFirst({
          where: { id: planId },
          select: { id: true, priceAmount: true, currency: true, interval: true, status: true },
        });
        if (!plan) {
          throw new BadRequestException({
            message: 'Selected membership plan was not found',
            code: 'PLAN_NOT_FOUND',
          });
        }
        if (plan.status !== SubscriptionPlanStatus.ACTIVE) {
          throw new BadRequestException({
            message: 'Selected membership plan is not active',
            code: 'PLAN_INACTIVE',
          });
        }
        const start = startDate ? new Date(startDate) : new Date();
        await tx.subscription.create({
          data: {
            gymId: this.tenant.gymId,
            planId: plan.id,
            memberId: member.id,
            status: SubscriptionStatus.ACTIVE,
            priceAmount: plan.priceAmount,
            currency: plan.currency,
            interval: plan.interval,
            currentPeriodStart: start,
            currentPeriodEnd: this.addInterval(start, plan.interval),
          },
        });
      }

      return member;
    });

    // Fire the `member_joined` automation trigger (T12.5) — best-effort and
    // out-of-band: automation must never block or fail member creation, so the
    // dispatch is not awaited and its (already-swallowed) errors are ignored.
    void this.automation.dispatchForGym(this.tenant.gymId, AutomationTriggerType.member_joined, {
      entityId: created.id,
      entityType: 'member',
    });

    // Award the loyalty signup bonus (T12.10) — same best-effort, fire-and-forget
    // contract as the automation dispatch: it no-ops when the program is disabled
    // and never blocks or fails member creation.
    void this.loyalty.awardSignupBonus(this.tenant.gymId, created.id).catch(() => undefined);

    // Re-read through the full detail path so a brand-new member's response
    // carries every "formacore" field (empty history, zero KPIs) consistently.
    return this.getMember(created.id);
  }

  /**
   * Advance a date by one billing period — a year for `YEAR` plans, else a month.
   * Used to seed a new enrolment's `currentPeriodEnd` from its start.
   */
  private addInterval(from: Date, interval: SubscriptionInterval): Date {
    const end = new Date(from);
    if (interval === SubscriptionInterval.YEAR) {
      end.setFullYear(end.getFullYear() + 1);
    } else {
      end.setMonth(end.getMonth() + 1);
    }
    return end;
  }

  /**
   * Hold a create to the intake fields the gym configured in Settings → Membership:
   * a toggle that is on means the field is asked for *and* required, so a create
   * that leaves one blank is a `400 MEMBER_INTAKE_REQUIRED` naming what is missing.
   *
   * Checked here rather than in `createMemberSchema` because the answer depends on
   * the tenant's stored settings, which a static DTO cannot reach — and checked at
   * all because the console rendering a required input is not enforcement. A stale
   * browser tab opened before the setting changed, the POS till, and anything
   * hitting `POST /members` directly all reach this line.
   *
   * `surname` is skipped: the console joins it onto `name` before sending, so there
   * is no separate value here to find missing. `emergencyContact` is one toggle over
   * two columns and demands both — a next of kin with no number is not a next of kin.
   */
  private async assertIntakeSatisfied(input: CreateMemberInput): Promise<void> {
    const intake = await this.intake.get();

    const filled = (value: string | null | undefined): boolean => Boolean(value?.trim());
    // Exhaustive over `MemberIntakeField` on purpose: adding a toggle to the schema
    // without answering for it here becomes a compile error rather than a setting
    // the console renders as mandatory and the API quietly never checks.
    const present: Record<MemberIntakeField, boolean> = {
      name: filled(input.name),
      // Always satisfied: the console folds it into `name` before sending, so
      // treating it as missing here would reject every create.
      surname: true,
      email: filled(input.email),
      phone: filled(input.phone),
      gender: Boolean(input.gender),
      dateOfBirth: filled(input.dateOfBirth),
      startDate: filled(input.startDate),
      personalId: filled(input.personalId),
      address: filled(input.address),
      emergencyContact: filled(input.emergencyContactName) && filled(input.emergencyContactPhone),
      medicalNotes: filled(input.medicalNotes),
      // Never required (`requiredIntakeFields` exempts both), so the value is moot.
      membershipPlan: true,
      paymentMethod: true,
    };

    const missing = requiredIntakeFields(intake).filter((field) => !present[field]);
    if (missing.length > 0) {
      throw new BadRequestException({
        message: `Your gym’s member form requires: ${missing.join(', ')}`,
        code: 'MEMBER_INTAKE_REQUIRED',
        fields: missing,
      });
    }
  }

  /**
   * The `GymMember` profile columns to write from a create/update body. A field
   * that is **absent** (`undefined`) is omitted (left untouched); an **empty**
   * field arrives as `null` from the schema and clears the column. `dateOfBirth`
   * and `startDate` are coerced from their ISO strings to `Date`s — both are
   * calendar days, so a bare `YYYY-MM-DD` lands at UTC midnight and reads back as
   * the same day whatever zone the server runs in.
   */
  private profileWriteData(input: CreateMemberInput | UpdateMemberInput): {
    dateOfBirth?: Date | null;
    startDate?: Date | null;
    personalId?: string | null;
    gender?: Gender | null;
    address?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    medicalNotes?: string | null;
  } {
    const data: ReturnType<MembersService['profileWriteData']> = {};
    if (input.dateOfBirth !== undefined) {
      data.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
    }
    if (input.startDate !== undefined) {
      data.startDate = input.startDate ? new Date(input.startDate) : null;
    }
    if (input.personalId !== undefined) data.personalId = input.personalId;
    if (input.gender !== undefined) data.gender = input.gender;
    if (input.address !== undefined) data.address = input.address;
    if (input.emergencyContactName !== undefined) {
      data.emergencyContactName = input.emergencyContactName;
    }
    if (input.emergencyContactPhone !== undefined) {
      data.emergencyContactPhone = input.emergencyContactPhone;
    }
    if (input.medicalNotes !== undefined) data.medicalNotes = input.medicalNotes;
    return data;
  }

  /**
   * Edit a member's profile (`name` / `phone`, T4.3). The id must resolve to a
   * `MEMBER`-role membership in the caller's gym (the scoped `where` makes a
   * cross-tenant id a `404`). The fields live on the shared `User`, so the update
   * targets the membership's `userId`; the email and status are deliberately not
   * editable here (see {@link updateMemberSchema}). Returns the updated detail.
   */
  async updateMember(id: string, input: UpdateMemberInput): Promise<UpdateMemberResponse> {
    const member = await this.requireMember(id);

    // `name` / `phone` live on the shared `User`; the profile extras live on the
    // gym-scoped `GymMember`. Write both (the profile write is skipped when the
    // body carries no profile fields).
    await this.prisma.client.user.update({
      where: { id: member.userId },
      data: { name: input.name, phone: input.phone },
    });

    // A branch move rides with the profile write. `updateMemberSchema.locationId`
    // is not nullable, so an omitted branch leaves the member where they are and
    // there is no way to un-assign one through this route.
    if (input.locationId) {
      await this.resolveHomeBranch(input.locationId);
    }

    const profile = {
      ...this.profileWriteData(input),
      ...(input.locationId ? { locationId: input.locationId } : {}),
    };
    if (Object.keys(profile).length > 0) {
      await this.prisma.client.gymMember.update({ where: { id }, data: profile });
    }

    return this.getMember(id);
  }

  /**
   * Add a staff note to a member (T4.x). The author is resolved server-side from
   * the request's session (never trusted from the client body): the writing
   * staff `User`'s id + display name, snapshotted onto the note. 404s an unknown
   * / cross-tenant member. Returns the fresh detail.
   */
  async addNote(id: string, input: CreateMemberNoteInput): Promise<GetMemberResponse> {
    await this.requireMember(id);
    const authorId = this.tenant.userId ?? null;
    const author = authorId
      ? await this.prisma.client.user.findUnique({
          where: { id: authorId },
          select: { name: true, email: true },
        })
      : null;
    await this.prisma.client.memberNote.create({
      data: {
        gymId: this.tenant.gymId,
        memberId: id,
        authorId,
        authorName: author?.name ?? author?.email ?? 'Staff',
        body: input.body,
      },
    });
    return this.getMember(id);
  }

  /** Log a follow-up task against a member (T4.x). 404s a bad id; returns the detail. */
  async addTask(id: string, input: CreateMemberTaskInput): Promise<GetMemberResponse> {
    await this.requireMember(id);
    await this.prisma.client.memberTask.create({
      data: {
        gymId: this.tenant.gymId,
        memberId: id,
        title: input.title,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        assignee: input.assignee ?? null,
      },
    });
    return this.getMember(id);
  }

  /**
   * Toggle a member task between pending and done (T4.x). The task must belong to
   * the member (and, by tenant scope, the gym); an unknown member or task is a
   * `404`. Returns the fresh detail.
   */
  async setTaskStatus(
    id: string,
    taskId: string,
    input: UpdateMemberTaskInput,
  ): Promise<GetMemberResponse> {
    await this.requireMember(id);
    const task = await this.prisma.client.memberTask.findFirst({
      where: { id: taskId, memberId: id },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException({ message: 'Task not found', code: 'MEMBER_TASK_NOT_FOUND' });
    }
    await this.prisma.client.memberTask.update({
      where: { id: taskId },
      data: { status: input.status },
    });
    return this.getMember(id);
  }

  /**
   * Deactivate a member (T4.3) — set the membership `status` to `SUSPENDED` so the
   * person can no longer obtain a member session for this gym while their record
   * (and history) is preserved. Idempotent: deactivating an already-suspended
   * member is a no-op `200`. A `404` for an unknown / cross-tenant id.
   */
  async deactivateMember(id: string): Promise<SetMemberStatusResponse> {
    return this.setStatus(id, GymMemberStatus.SUSPENDED);
  }

  /**
   * Reactivate a member (T4.3) — the inverse of {@link deactivateMember}, setting
   * the membership `status` back to `ACTIVE`. Idempotent and `404`-on-miss like
   * its counterpart.
   */
  async reactivateMember(id: string): Promise<SetMemberStatusResponse> {
    return this.setStatus(id, GymMemberStatus.ACTIVE);
  }

  /**
   * Pin a member's standing, or clear the pin and hand it back to the derivation
   * (`kind: null`).
   *
   * An override is a statement that the rules are wrong about this person — a
   * lifetime member who is never billed, a guest kept on the list deliberately.
   * It is stored rather than derived precisely because nothing in the data can
   * imply it, and it stays until staff clear it: a later subscription does not
   * silently take it back, since that would undo a decision someone made on
   * purpose.
   */
  async setMemberKind(id: string, kind: MemberKind | null): Promise<SetMemberStatusResponse> {
    await this.requireMember(id);
    await this.prisma.client.gymMember.update({
      where: { id },
      data: { kindOverride: kind },
    });
    return this.getMember(id);
  }

  /** Set a member's lifecycle `status`, 404-ing an unknown / cross-tenant id. */
  private async setStatus(id: string, status: GymMemberStatus): Promise<SetMemberStatusResponse> {
    await this.requireMember(id);
    await this.prisma.client.gymMember.update({ where: { id }, data: { status } });
    return this.getMember(id);
  }

  /**
   * Move a member to trash (soft-delete, T-members-trash) — stamp `deletedAt = now`
   * so the member drops out of the roster, tab counts, plan mix, check-in, and the
   * dashboard's live counts, while the row + history survive for restore. The purge
   * cron hard-deletes it after the retention window. Idempotent-ish: an
   * already-trashed member 404s from {@link requireMember} (it only resolves live
   * members), so the caller sees a clean "not found among live members". Returns
   * the trashed member's detail.
   */
  async softDeleteMember(id: string): Promise<SetMemberStatusResponse> {
    await this.requireMember(id);
    await this.prisma.client.gymMember.update({ where: { id }, data: { deletedAt: new Date() } });
    return this.getMember(id);
  }

  /**
   * Restore a trashed member (the inverse of {@link softDeleteMember}) — clear
   * `deletedAt` so the member returns to the live roster with its prior `status`
   * intact. Only a currently-trashed member resolves; a live or unknown id 404s.
   * Returns the restored member's detail.
   */
  async restoreMember(id: string): Promise<SetMemberStatusResponse> {
    await this.requireTrashedMember(id);
    await this.prisma.client.gymMember.update({ where: { id }, data: { deletedAt: null } });
    return this.getMember(id);
  }

  /**
   * Send a one-off staff email to a member. Resolves the live member + recipient
   * address, runs a final merge-field interpolation pass over the (already
   * client-personalized, staff-editable) subject/body — a safety net that also
   * personalizes a from-scratch message — wraps the body in the branded email shell,
   * and dispatches via Resend ({@link MailerService}). It throws a clear
   * `EMAIL_NOT_CONFIGURED` when no `RESEND_API_KEY` is set so staff never see a false
   * success, and `EMAIL_SEND_FAILED` when the provider rejects the send. `MemberWrite`
   * is enforced at the controller.
   */
  async sendMemberEmail(id: string, input: SendMemberEmailInput): Promise<SendMemberEmailResponse> {
    const member = await this.prisma.client.gymMember.findFirst({
      where: { id, role: Role.MEMBER, deletedAt: null },
      select: {
        id: true,
        status: true,
        joinedAt: true,
        dateOfBirth: true,
        user: { select: { name: true, email: true, phone: true } },
        subscriptions: {
          where: { status: { in: [...LIVE_SUBSCRIPTION_STATUSES] } },
          orderBy: { currentPeriodEnd: 'desc' },
          take: 1,
          select: {
            currentPeriodEnd: true,
            plan: { select: { name: true, priceAmount: true, currency: true } },
          },
        },
        // Backs `{{member_checkin_count}}`, which the drawer's picker can offer
        // via an automation rule body. Same select as `AutomationMergeService`'s
        // `MEMBER_SELECT`, so the two pipelines quote the same number.
        _count: { select: { checkIns: true } },
      },
    });
    if (!member) {
      throw new NotFoundException({ message: 'Member not found', code: 'MEMBER_NOT_FOUND' });
    }

    // Fail loud (not a silent "sent") when outbound mail is disabled — this is the
    // dev/preview default until a `RESEND_API_KEY` is set.
    if (!this.mailer.isConfigured) {
      throw new ServiceUnavailableException({
        message: 'Email delivery is not configured yet.',
        code: 'EMAIL_NOT_CONFIGURED',
      });
    }

    const { gymName, business, language } = await this.resolveGymMergeContext();
    const values = buildMemberMergeValues({
      member,
      gymName,
      business,
      language,
      pointsBalance: await this.pointsBalance(member.id),
      today: new Date(),
    });
    const subject = interpolateMergeFields(input.subject, values);
    const body = interpolateMergeFields(input.body, values);

    const locale = resolveEmailLocale(language);
    const html = renderBrandedEmail({
      locale,
      senderName: escapeHtml(gymName),
      heading: escapeHtml(subject),
      contentHtml: renderEmailParagraphs(body),
      footerNote: escapeHtml(emailStrings(locale).shell.sentBy(gymName)),
    });

    const { sent } = await this.mailer.send({ to: member.user.email, subject, html, text: body });
    if (!sent) {
      throw new ServiceUnavailableException({
        message: 'The email could not be sent. Please try again.',
        code: 'EMAIL_SEND_FAILED',
      });
    }
    return { sent: true };
  }

  /**
   * The gym's name, contact details and language, for a send. The language is
   * what `{{payment_amount}}` is formatted in, so the drawer quotes a price
   * exactly as an automation send would.
   */
  private async resolveGymMergeContext(): Promise<{
    gymName: string;
    business: { phone: string; email: string; address: string; website: string };
    language: GymLanguage;
  }> {
    const gym = await this.prisma.client.gym.findFirst({
      where: { id: this.tenant.gymId },
      select: { name: true, settings: true },
    });
    const stored = gymSettingsStoredSchema.parse(gym?.settings ?? {});
    return {
      gymName: gym?.name ?? 'Your gym',
      business: {
        phone: stored.business.phone ?? '',
        email: stored.business.email ?? '',
        address: stored.business.address ?? '',
        website: stored.business.website ?? '',
      },
      language: stored.locale.language,
    };
  }

  /**
   * The member's live points balance — the `balanceAfter` the loyalty ledger last
   * recorded, or `0` for a member who has never earned any. Backs
   * `{{member_points_balance}}`, which the drawer's picker can offer via an
   * automation rule body.
   *
   * A mirror of `AutomationMergeService.pointsBalance`, deliberately: one indexed
   * row, read separately rather than widening the send's member select with a
   * join. Scoped to `this.tenant.gymId` so a ledger row from another tenant can
   * never answer for this member.
   */
  private async pointsBalance(memberId: string): Promise<number> {
    const latest = await this.prisma.client.loyaltyLedgerEntry.findFirst({
      where: { gymId: this.tenant.gymId, memberId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    });
    return latest?.balanceAfter ?? 0;
  }

  /**
   * Resolve a **live** (`deletedAt: null`) `MEMBER`-role membership in the caller's
   * gym or throw a `404 MEMBER_NOT_FOUND`. The scoped `where` constrains `gymId`,
   * so a cross-tenant id simply never matches — the guard for every write, and it
   * deliberately excludes trashed members so nothing but restore can touch them.
   */
  private async requireMember(id: string): Promise<{ id: string; userId: string }> {
    const member = await this.prisma.client.gymMember.findFirst({
      where: { id, role: Role.MEMBER, deletedAt: null },
      select: { id: true, userId: true },
    });
    if (!member) {
      throw new NotFoundException({ message: 'Member not found', code: 'MEMBER_NOT_FOUND' });
    }
    return member;
  }

  /**
   * Resolve a currently-**trashed** (`deletedAt` set) `MEMBER`-role membership in
   * the caller's gym or throw a `404 MEMBER_NOT_FOUND` — the guard for {@link
   * restoreMember}, so restoring a live or unknown id is a clean 404.
   */
  private async requireTrashedMember(id: string): Promise<{ id: string }> {
    const member = await this.prisma.client.gymMember.findFirst({
      where: { id, role: Role.MEMBER, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException({ message: 'Member not found', code: 'MEMBER_NOT_FOUND' });
    }
    return member;
  }

  /**
   * Enqueue an async CSV export of the selected members (or, with no `ids`, the
   * members matching `filters` / the whole gym). The export is generated off the
   * request path and streamed (never an in-memory array), so this only registers
   * the job and hands back its `jobId`; the worker that produces the file lands
   * with the export-job infrastructure. Returns `202 Accepted`.
   */
  bulkExport(_input: BulkExportMembersInput): Promise<BulkExportMembersResponse> {
    // The streaming CSV worker is deferred (see the class docstring); for now the
    // endpoint honours its contract by minting the job handle the client polls.
    return Promise.resolve({ jobId: randomUUID() });
  }

  /* ---------------------------------------------------------------------- */
  /*  Roster aggregates                                                      */
  /* ---------------------------------------------------------------------- */

  /**
   * The gym-wide live plan mix — live subscriptions (ACTIVE / PAST_DUE / FROZEN)
   * grouped by their catalogue plan, labelled with each plan's name, richest
   * first. A subscription whose plan was deleted rolls up under `"No plan"`.
   * `total` is the paid-members count across all plans. Mirrors the dashboard's
   * plan mix. Independent of the page's filters (it describes the whole gym).
   */
  private async planMix(locationId?: string): Promise<MemberPlanMix> {
    const db = this.prisma.client;
    const grouped = await db.subscription.groupBy({
      by: ['planId'],
      // Exclude subscriptions owned by trashed members — the mix describes the live
      // roster. `Subscription` has no branch of its own; it inherits the one on the
      // member who holds it, which is the same attribution rule the roster above
      // uses, so the bar always describes exactly the members listed beneath it.
      where: {
        status: { in: [...LIVE_SUBSCRIPTION_STATUSES] },
        member: { deletedAt: null, ...atLocation(locationId) },
      },
      _count: { _all: true },
    });
    if (grouped.length === 0) {
      return { total: 0, plans: [] };
    }

    const planIds = grouped.map((g) => g.planId).filter((id): id is string => id !== null);
    const plans =
      planIds.length === 0
        ? []
        : await db.subscriptionPlan.findMany({
            where: { id: { in: planIds } },
            select: { id: true, name: true },
          });
    const nameById = new Map(plans.map((p) => [p.id, p.name]));

    let total = 0;
    const slices = grouped
      .map((g) => {
        const count = g._count._all;
        total += count;
        return {
          planId: g.planId,
          name: g.planId === null ? 'No plan' : (nameById.get(g.planId) ?? 'Deleted plan'),
          count,
        };
      })
      .sort((a, b) => b.count - a.count)
      .map((slice, i) => ({ ...slice, color: PLAN_COLORS[i % PLAN_COLORS.length] ?? null }));

    return { total, plans: slices };
  }

  /**
   * The gym-wide member counts per segment for the roster's tabs. `all` / `active`
   * / `trial` (INVITED) / `expired` (SUSPENDED) group the `MEMBER`-role
   * memberships by `GymMemberStatus`; `frozen` counts members holding a live
   * `FROZEN` subscription. Independent of the page's filters.
   */
  private async tabCounts(locationId?: string): Promise<MemberTabCounts> {
    const db = this.prisma.client;
    // Every count carries the branch the roster is showing. A tab badge that
    // counts the whole gym above rows that show one branch is not a cosmetic
    // mismatch — it is the screen contradicting itself.
    const branch = atLocation(locationId);
    // The status segments and the frozen/plan aggregates describe the live roster,
    // so they exclude trashed members; `trash` counts the soft-deleted ones.
    const kindCount = (kind: MemberKind): Promise<number> =>
      db.gymMember.count({
        where: { role: Role.MEMBER, deletedAt: null, ...branch, ...memberKindWhere(kind) },
      });

    const [byStatus, frozen, trash, member, guest, inactive] = await Promise.all([
      db.gymMember.groupBy({
        by: ['status'],
        where: { role: Role.MEMBER, deletedAt: null, ...branch },
        _count: { _all: true },
      }),
      db.gymMember.count({
        where: {
          role: Role.MEMBER,
          deletedAt: null,
          ...branch,
          subscriptions: { some: { status: SubscriptionStatus.FROZEN } },
        },
      }),
      db.gymMember.count({ where: { role: Role.MEMBER, deletedAt: { not: null }, ...branch } }),
      kindCount('MEMBER'),
      kindCount('GUEST'),
      kindCount('INACTIVE'),
    ]);

    const countOf = (status: GymMemberStatus): number =>
      byStatus.find((g) => g.status === status)?._count._all ?? 0;

    const active = countOf(GymMemberStatus.ACTIVE);
    const trial = countOf(GymMemberStatus.INVITED);
    const expired = countOf(GymMemberStatus.SUSPENDED);

    return {
      all: active + trial + expired,
      member,
      guest,
      inactive,
      active,
      frozen,
      trial,
      expired,
      trash,
    };
  }

  /**
   * The tenant-scoped `where` for the roster: always the gym's `MEMBER`-role
   * memberships (the extension adds `gymId`), narrowed by an optional `status`, a
   * case-insensitive `search` across the member's name + email, an optional
   * and live-subscription `planId`.
   */
  private buildWhere(query: ListMembersQuery): Prisma.GymMemberWhereInput {
    const where: Prisma.GymMemberWhereInput = { role: Role.MEMBER };

    // The trash view lists only soft-deleted members; every other view lists live
    // members and excludes the trashed. The view swaps *which* members are in
    // scope — the search box and Filter panel stay on screen either way, so every
    // other narrow below still applies. Only the `status` segments are dropped:
    // the view stands in for them.
    const isTrash = query.view === 'trash';
    where.deletedAt = isTrash ? { not: null } : null;

    // The roster's primary segment. Derived, so it is expressed as the subscription
    // + override conditions `memberKindWhere` mirrors from `resolveMemberKind`.
    if (query.kind) {
      Object.assign(where, memberKindWhere(query.kind));
    }

    if (query.status && !isTrash) {
      where.status = query.status;
    }

    // The member's HOME branch (`GymMember.locationId`) — not anywhere they have
    // ever trained. Plain equality: the Stage 2 migration backfilled every member
    // onto their gym's default branch, so there are no unattributed rows left to
    // `OR … IS NULL` for, and `@@index([gymId, locationId, status])` serves it.
    Object.assign(where, atLocation(query.locationId));

    const search = query.search?.trim();
    if (search) {
      where.user = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    // Subscription-derived narrows, each a distinct `some` predicate: the plan
    // filter (a live subscription on the given plan) and the Frozen tab (any
    // `FROZEN` subscription). Combined via `AND` so both hold independently — a
    // single `where.subscriptions` would let the later one clobber the earlier.
    const subFilters: Prisma.SubscriptionWhereInput[] = [];
    if (query.planId) {
      subFilters.push({ planId: query.planId, status: { in: [...LIVE_SUBSCRIPTION_STATUSES] } });
    }
    if (query.frozen) {
      subFilters.push({ status: SubscriptionStatus.FROZEN });
    }
    if (subFilters.length === 1) {
      where.subscriptions = { some: subFilters[0] };
    } else if (subFilters.length > 1) {
      where.AND = subFilters.map((some) => ({ subscriptions: { some } }));
    }

    return where;
  }

  /**
   * Map the requested sort column to a Prisma `orderBy`. `name` sorts on the
   * joined user; `lastVisitAt` has no scalar column (visits live on `CheckIn`), so
   * it falls back to `joinedAt` — a stable, meaningful order the roster still
   * surfaces `lastVisitAt` for per-row.
   */
  private buildOrderBy(query: ListMembersQuery): Prisma.GymMemberOrderByWithRelationInput {
    switch (query.sort) {
      case 'name':
        return { user: { name: query.dir } };
      case 'status':
        return { status: query.dir };
      case 'joinedAt':
      case 'lastVisitAt':
      default:
        return { joinedAt: query.dir };
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  Row / detail projection                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * The home branch to store for a member: the one the caller named, or the gym's
   * default when they named none.
   *
   * A named branch is validated against the tenant first — `location.findFirst`
   * goes through the scoped client, so a branch belonging to another gym simply
   * never matches and is rejected as unknown rather than leaking its existence.
   * Same shape as `AdminScheduleService.requireGymLocation`.
   *
   * **A gym with no default branch yields `null`, and that is deliberate.** Every
   * gym is given one by the Stage 0 migration, so this only happens if an operator
   * has since cleared the flag — and a half-configured branch list must not be the
   * reason a front desk cannot add a member. The member is created unattributed
   * and shows in every branch until someone edits them.
   */
  private async resolveHomeBranch(locationId: string | undefined): Promise<string | null> {
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

  /** Project a queried membership row to the denormalised wire {@link MemberRow}. */
  private toRow(row: MemberRecord): MemberRow {
    const sub = row.subscriptions[0] ?? null;
    const plan = this.toPlan(sub);
    const lastVisitAt = row.checkIns[0]?.checkedInAt.toISOString() ?? null;
    const { nextBillingAt, billingState } = this.toBilling(sub);

    return {
      id: row.id,
      name: row.user.name ?? row.user.email,
      email: row.user.email,
      phone: row.user.phone,
      status: row.status,
      kind: resolveMemberKind({
        kindOverride: row.kindOverride,
        status: row.status,
        hasLiveSubscription: sub !== null,
        // A live subscription is itself proof they have ever held one, so the
        // count only decides the lapsed-vs-guest split.
        hasEverSubscribed: row._count.subscriptions > 0 || sub !== null,
      }),
      kindOverride: row.kindOverride,
      planName: plan?.name ?? null,
      plan,
      // `null` rather than `''`: `locationId` is `SetNull`, so closing a branch
      // genuinely un-attributes the people who trained there, and the table must
      // be able to say so instead of printing an empty name.
      locationName: row.location?.name ?? null,
      lastVisitAt,
      nextBillingAt,
      billingState,
      outstanding: this.toOutstanding(row.invoices),
      deletedAt: row.deletedAt?.toISOString() ?? null,
    };
  }

  /** The sum of PENDING invoices, in the first one's currency; `null` when clear. */
  private toOutstanding(
    invoices: ReadonlyArray<{ amount: number; currency: string }>,
  ): MemberRow['outstanding'] {
    if (invoices.length === 0) return null;
    const currency = invoices[0]!.currency;
    const amount = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    return amount > 0 ? { amount, currency } : null;
  }

  /** The live plan denormalised for the roster's PLAN cell, or `null` for none. */
  private toPlan(sub: LiveSubscription | null): MemberPlan | null {
    if (!sub) {
      return null;
    }
    return {
      planId: sub.planId,
      name: sub.plan?.name ?? 'No plan',
      interval: sub.interval,
      priceAmount: sub.priceAmount,
      currency: sub.currency,
      detail: this.planDetail(sub),
      // Stable per-member colour from the plan id, or the brand default.
      color: sub.planId ? this.planColor(sub.planId) : (PLAN_COLORS[0] ?? null),
    };
  }

  /**
   * A short PLAN-cell hint: a paused / overdue state when the subscription is
   * frozen / past-due, else the billing cadence ("annual" / "monthly").
   */
  private planDetail(sub: LiveSubscription): string {
    if (sub.status === SubscriptionStatus.FROZEN) {
      return 'paused';
    }
    if (sub.status === SubscriptionStatus.PAST_DUE) {
      return 'overdue';
    }
    return sub.interval === 'YEAR' ? 'annual' : 'monthly';
  }

  /**
   * The NEXT-BILLING cell for the live subscription: a `paused` frozen sub, an
   * `overdue` past-due one, else the `due` date at `currentPeriodEnd`. `none` (no
   * date) when the member has no live subscription.
   */
  private toBilling(sub: LiveSubscription | null): {
    nextBillingAt: string | null;
    billingState: MemberBillingState;
  } {
    if (!sub) {
      return { nextBillingAt: null, billingState: 'none' };
    }
    if (sub.status === SubscriptionStatus.FROZEN) {
      return { nextBillingAt: null, billingState: 'paused' };
    }
    if (sub.status === SubscriptionStatus.PAST_DUE) {
      return { nextBillingAt: sub.currentPeriodEnd.toISOString(), billingState: 'overdue' };
    }
    return { nextBillingAt: sub.currentPeriodEnd.toISOString(), billingState: 'due' };
  }

  /** A deterministic swatch for a plan id (so the roster + detail agree per plan). */
  private planColor(planId: string): string {
    let hash = 0;
    for (let i = 0; i < planId.length; i += 1) {
      hash = (hash * 31 + planId.charCodeAt(i)) >>> 0;
    }
    return PLAN_COLORS[hash % PLAN_COLORS.length] ?? PLAN_COLORS[0]!;
  }

  /**
   * Assemble the full member detail from the row plus its real history: the
   * `lifetimeValue` (SUM captured payments on the member's orders), `totalVisits`
   * (CheckIn count), `currentPlan` (+ days-remaining), the `recentActivity` merge
   * and the 8-week `attendance` series. `notes` are honest empty states
   * (no backing model). Every collection query is tenant-scoped by the extension.
   */
  private async buildDetail(row: MemberRecord): Promise<MemberDetail> {
    const db = this.prisma.client;
    const memberId = row.id;
    const sub = row.subscriptions[0] ?? null;
    const since = new Date(Date.now() - ATTENDANCE_WEEKS * 7 * DAY_MS);

    const [
      lifetime,
      totalVisits,
      subscriptions,
      bookings,
      payments,
      invoices,
      recentCheckIns,
      attendanceCheckIns,
      accessLog,
      purchases,
      notes,
      tasks,
    ] = await Promise.all([
      // Lifetime value: SUM of CAPTURED payments on the member's orders.
      db.payment.aggregate({
        where: { status: PaymentStatus.CAPTURED, order: { memberId } },
        _sum: { amount: true },
      }),
      db.checkIn.count({ where: { gymMemberId: memberId } }),
      // Subscriptions tab — every subscription the member has held, newest first.
      db.subscription.findMany({
        where: { memberId },
        orderBy: { currentPeriodStart: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          plan: { select: { name: true } },
        },
      }),
      // Bookings tab — the member's class reservations, newest occurrence first.
      db.booking.findMany({
        where: { memberId },
        orderBy: { classInstance: { startsAt: 'desc' } },
        take: 20,
        select: {
          id: true,
          status: true,
          classInstance: {
            select: {
              startsAt: true,
              template: { select: { title: true } },
              classType: { select: { name: true } },
            },
          },
        },
      }),
      // Payments tab — captured payments on the member's orders, newest first.
      db.payment.findMany({
        where: { status: PaymentStatus.CAPTURED, order: { memberId } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, amount: true, status: true, currency: true, createdAt: true },
      }),
      // Invoices tab — the member's numbered billing documents, newest first (T5.10).
      // Distinct from payments: an invoice is the document (with a PDF), not the charge.
      db.invoice.findMany({
        where: { memberId },
        orderBy: { issuedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          number: true,
          amount: true,
          currency: true,
          status: true,
          issuedAt: true,
        },
      }),
      // Recent check-ins feeding the activity timeline.
      db.checkIn.findMany({
        where: { gymMemberId: memberId },
        orderBy: { checkedInAt: 'desc' },
        take: ACTIVITY_SOURCE_LIMIT,
        select: { id: true, checkedInAt: true },
      }),
      // Attendance chart — every check-in in the trailing window (bucketed below).
      db.checkIn.findMany({
        where: { gymMemberId: memberId, checkedInAt: { gte: since } },
        orderBy: { checkedInAt: 'asc' },
        select: { checkedInAt: true },
      }),
      // Access Log tab — the member's recent check-ins (arrivals), newest first.
      db.checkIn.findMany({
        where: { gymMemberId: memberId },
        orderBy: { checkedInAt: 'desc' },
        take: 30,
        select: { id: true, checkedInAt: true, method: true, locationId: true },
      }),
      // Purchases tab — the member's POS orders (+ captured payment method), newest first.
      db.order.findMany({
        where: { memberId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          createdAt: true,
          total: true,
          currency: true,
          locationId: true,
          items: { select: { label: true, qty: true } },
          payment: { select: { method: true } },
        },
      }),
      // Notes & Tasks tab — staff notes, newest first.
      db.memberNote.findMany({
        where: { memberId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, authorName: true, body: true, createdAt: true },
      }),
      // Notes & Tasks tab — follow-up tasks, newest first.
      db.memberTask.findMany({
        where: { memberId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          dueDate: true,
          assignee: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    const currency = payments[0]?.currency ?? sub?.currency ?? 'GEL';
    const wireSubscriptions = subscriptions.map((s) => ({
      id: s.id,
      planName: s.plan?.name ?? 'No plan',
      status: s.status,
      startedAt: s.currentPeriodStart.toISOString(),
      renewsAt: s.currentPeriodEnd.toISOString(),
    }));
    const wireBookings = bookings.map((b) => ({
      id: b.id,
      title: b.classInstance.template?.title ?? b.classInstance.classType?.name ?? 'Class',
      startsAt: b.classInstance.startsAt.toISOString(),
      status: b.status,
    }));
    const wirePayments = payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      status: p.status,
      paidAt: p.createdAt.toISOString(),
    }));
    const wireInvoices = invoices.map((i) => ({
      id: i.id,
      number: i.number,
      amount: i.amount,
      currency: i.currency,
      status: i.status,
      issuedAt: i.issuedAt.toISOString(),
    }));
    const wirePurchases: MemberPurchase[] = purchases.map((o) => ({
      id: o.id,
      at: o.createdAt.toISOString(),
      items: o.items.map((it) => ({ label: it.label, qty: it.qty })),
      total: o.total,
      currency: o.currency,
      method: o.payment?.method ?? null,
      location: o.locationId ?? null,
    }));
    const wireAccessLog: MemberAccessLogEntry[] = accessLog.map((c) => ({
      id: c.id,
      at: c.checkedInAt.toISOString(),
      method: c.method,
      location: c.locationId ?? null,
    }));
    const wireNotes: MemberNoteEntry[] = notes.map((n) => ({
      id: n.id,
      author: n.authorName,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
    }));
    const wireTasks: MemberTaskEntry[] = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      assignee: t.assignee ?? null,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    }));

    return {
      ...this.toRow(row),
      joinedAt: row.joinedAt.toISOString(),
      lifetimeValue: lifetime._sum.amount ?? 0,
      currency,
      totalVisits,
      currentPlan: this.toCurrentPlan(sub),
      recentActivity: this.buildActivity(row, recentCheckIns, wireBookings, wirePayments),
      attendance8w: this.bucketAttendance(attendanceCheckIns),
      subscriptions: wireSubscriptions,
      bookings: wireBookings,
      payments: wirePayments,
      invoices: wireInvoices,
      purchases: wirePurchases,
      accessLog: wireAccessLog,
      // Staff-managed profile extras (real `GymMember` columns; null when unset).
      dateOfBirth: row.dateOfBirth ? row.dateOfBirth.toISOString() : null,
      startDate: row.startDate ? row.startDate.toISOString() : null,
      personalId: row.personalId,
      gender: row.gender,
      address: row.address,
      emergencyContactName: row.emergencyContactName,
      emergencyContactPhone: row.emergencyContactPhone,
      medicalNotes: row.medicalNotes,
      notes: wireNotes,
      tasks: wireTasks,
    };
  }

  /** The live subscription projected to the detail's "Current plan" panel. */
  private toCurrentPlan(sub: LiveSubscription | null): MemberCurrentPlan | null {
    if (!sub) {
      return null;
    }
    const remainingMs = sub.currentPeriodEnd.getTime() - Date.now();
    const daysRemaining = Math.max(0, Math.ceil(remainingMs / DAY_MS));
    return {
      subscriptionId: sub.id,
      planId: sub.planId,
      name: sub.plan?.name ?? 'No plan',
      status: sub.status,
      interval: sub.interval,
      priceAmount: sub.priceAmount,
      currency: sub.currency,
      currentPeriodStart: sub.currentPeriodStart.toISOString(),
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      daysRemaining,
      color: sub.planId ? this.planColor(sub.planId) : (PLAN_COLORS[0] ?? null),
      frozenUntil: sub.frozenUntil ? sub.frozenUntil.toISOString() : null,
      freezeDaysPerPeriod: sub.plan?.freezeDaysPerPeriod ?? DEFAULT_FREEZE_DAYS_PER_PERIOD,
      freezeDaysUsed: sub.freezeDaysUsed,
    };
  }

  /**
   * Merge the member's real recent check-ins / bookings / payments (+ the join
   * milestone) into one newest-first timeline, capped. Never fabricated — an entry
   * exists only for a real record.
   */
  private buildActivity(
    row: MemberRecord,
    checkIns: ReadonlyArray<{ id: string; checkedInAt: Date }>,
    bookings: ReadonlyArray<{ id: string; title: string; startsAt: string; status: string }>,
    payments: ReadonlyArray<{ id: string; amount: number; status: string; paidAt: string }>,
  ): MemberActivity[] {
    const entries: MemberActivity[] = [];

    for (const checkIn of checkIns) {
      entries.push({
        kind: 'checkin',
        title: 'Checked in',
        detail: 'Gym visit',
        at: checkIn.checkedInAt.toISOString(),
      });
    }
    for (const booking of bookings.slice(0, ACTIVITY_SOURCE_LIMIT)) {
      entries.push({
        kind: 'booking',
        title: `Booked ${booking.title}`,
        detail: booking.status,
        at: booking.startsAt,
      });
    }
    for (const payment of payments.slice(0, ACTIVITY_SOURCE_LIMIT)) {
      entries.push({
        kind: 'payment',
        title: 'Payment captured',
        detail: this.formatMinor(payment.amount, row.subscriptions[0]?.currency ?? 'GEL'),
        at: payment.paidAt,
      });
    }
    entries.push({
      kind: 'milestone',
      title: 'Joined the gym',
      detail: 'Membership started',
      at: row.joinedAt.toISOString(),
    });

    return entries
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, ACTIVITY_LIMIT);
  }

  /**
   * Bucket the member's trailing-window check-ins into {@link ATTENDANCE_WEEKS}
   * consecutive weeks, oldest → newest, each a `weekStart` (that week's start
   * instant) + its check-in `count`. Empty weeks are present with `count: 0`, so
   * the chart always has a full 8-column frame.
   */
  private bucketAttendance(checkIns: ReadonlyArray<{ checkedInAt: Date }>): MemberAttendanceWeek[] {
    const now = Date.now();
    // The window's first week starts (ATTENDANCE_WEEKS - 1) weeks before this week.
    const weekMs = 7 * DAY_MS;
    const currentWeekStart = now - (now % weekMs || 0);
    const windowStart = currentWeekStart - (ATTENDANCE_WEEKS - 1) * weekMs;

    const weeks: MemberAttendanceWeek[] = Array.from({ length: ATTENDANCE_WEEKS }, (_, i) => ({
      weekStart: new Date(windowStart + i * weekMs).toISOString(),
      count: 0,
    }));

    for (const checkIn of checkIns) {
      const idx = Math.floor((checkIn.checkedInAt.getTime() - windowStart) / weekMs);
      if (idx >= 0 && idx < ATTENDANCE_WEEKS) {
        weeks[idx]!.count += 1;
      }
    }
    return weeks;
  }

  /** Format a minor-unit amount as a currency string (e.g. `₾45.00`). */
  private formatMinor(amount: number, currency: string): string {
    const symbol = currency === 'GEL' ? '₾' : currency === 'USD' ? '$' : `${currency} `;
    return `${symbol}${(amount / 100).toFixed(2)}`;
  }
}
