import { readFileSync } from 'node:fs';
import {
  PrismaClient,
  Role,
  GymMemberStatus,
  SubscriptionStatus,
  SubscriptionInterval,
  generateClassInstances,
  initialBillingPeriod,
} from '@fit/db';
import type { ParsedArgs } from '../args';
import { stringFlag, boolFlag } from '../args';
import { CommandError, type CommandResult } from '../output';
import { loadInfraEnv } from '../env-source';

/**
 * `fit gym onboard` — stand up one real pilot gym end-to-end (T10.7).
 *
 * Turns the launch checklist's "onboard one real gym: owner, staff, plans,
 * schedule, ≥10 active members" into a single idempotent command instead of an
 * hour of manual console clicks. It operates directly on the database (like
 * `fit admin`), reusing the same Prisma writes the dev seed is built from and the
 * shared `@fit/db` primitives (`generateClassInstances`, `initialBillingPeriod`)
 * so the schedule horizon and the subscription periods are computed exactly the
 * way the API and the nightly cron compute them — no drift.
 *
 * Unlike the dev seed (which bakes the fixed demo `downtown` tenant), this is
 * parameterised for a *named real gym*, production-safe, and re-runnable: every
 * write is an upsert / existence-guard, so a second run is a no-op that simply
 * reconciles counts. The owner must already exist — a real owner signs up through
 * the normal auth flow and picks their own password first (the runbook's step 1);
 * the command then wires the gym around that account, so it never fabricates an
 * owner credential.
 *
 * Members and staff are provisioned without a password (verified accounts they
 * claim via password-reset), matching how the seed creates non-fixture members.
 * Pass `--roster <file>` to import the gym's real member list; otherwise
 * `--members <n>` generates a placeholder roster for a dry pilot.
 */

const USAGE =
  'usage: fit gym onboard --name <name> --slug <slug> --owner-email <email> ' +
  '[--members <n>] [--roster <file>] [--dry-run]';

/** The pilot go-live bar: a gym is not "onboarded" for launch below this many members (T10.7). */
export const PILOT_MEMBER_FLOOR = 10;

/** The default subscription plans a pilot gym opens with. Prices are GEL minor units (tetri). */
export const DEFAULT_PLANS = [
  { name: 'Premium', priceAmount: 12000, popular: true },
  { name: 'Standard', priceAmount: 7500, popular: false },
  { name: 'Student', priceAmount: 4500, popular: false },
] as const;

/**
 * The standard staff roster every gym needs to run the console: one membership per
 * non-MEMBER {@link Role} the console gates on. Provisioned ACTIVE on deterministic
 * placeholder emails (`<local>@<slug>.pilot`) so the owner can operate day one and
 * rename / re-invite the real people from the staff screen.
 */
export const DEFAULT_STAFF = [
  { role: Role.MANAGER, emailLocal: 'manager', name: 'Gym Manager' },
  { role: Role.RECEPTIONIST, emailLocal: 'reception', name: 'Front Desk' },
  { role: Role.TRAINER, emailLocal: 'coach', name: 'Head Coach' },
] as const;

/**
 * The opening class schedule: recurring weekly templates the shared generator
 * expands to the standard 4-week booking horizon. `hourUtc` anchors each
 * template's `validFrom` time-of-day so the materialised occurrences land at a
 * realistic clock hour (the same trick the seed uses), not at run time.
 */
export const DEFAULT_CLASSES = [
  {
    title: 'Morning HIIT',
    category: 'Conditioning',
    capacity: 20,
    durationMinutes: 60,
    rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    hourUtc: 7,
    color: '#ef4444',
  },
  {
    title: 'Evening Yoga',
    category: 'Mobility',
    capacity: 18,
    durationMinutes: 60,
    rrule: 'FREQ=WEEKLY;BYDAY=TU,TH',
    hourUtc: 18,
    color: '#10b981',
  },
  {
    title: 'Strength 101',
    category: 'Strength',
    capacity: 12,
    durationMinutes: 60,
    rrule: 'FREQ=WEEKLY;BYDAY=SA',
    hourUtc: 10,
    color: '#7c3aed',
  },
] as const;

/** A member to onboard: their name, email, and (optionally) the plan they sit on. */
export interface RosterRow {
  name: string;
  email: string;
  plan?: string;
}

/** The validated, normalised inputs to an onboarding run. */
export interface OnboardParams {
  name: string;
  slug: string;
  ownerEmail: string;
  members: number;
  rosterPath?: string;
  dryRun: boolean;
}

/** A gym subdomain slug: DNS-label-safe (lowercase alphanumerics + interior hyphens). */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Normalise an email for lookup/creation the way the auth layer stores it. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Parse + validate the `onboard` flags into {@link OnboardParams}. Pure (no I/O),
 * so the whole contract is unit-testable; throws {@link CommandError} with
 * `BAD_ARGUMENT` on any invalid input.
 */
export function parseOnboardArgs(args: ParsedArgs): OnboardParams {
  const name = stringFlag(args.flags, 'name')?.trim();
  const slug = stringFlag(args.flags, 'slug')?.trim().toLowerCase();
  const ownerEmailRaw = stringFlag(args.flags, 'owner-email');

  if (!name || !slug || !ownerEmailRaw) {
    throw new CommandError('--name, --slug and --owner-email are all required', {
      code: 'BAD_ARGUMENT',
      detail: USAGE,
    });
  }
  if (!SLUG_RE.test(slug)) {
    throw new CommandError(`Invalid --slug '${slug}' (expected a DNS-safe label)`, {
      code: 'BAD_ARGUMENT',
      detail: 'Lowercase letters, digits and interior hyphens only, e.g. "iron-house".',
    });
  }

  const rosterPath = stringFlag(args.flags, 'roster');
  const membersRaw = stringFlag(args.flags, 'members');
  let members = PILOT_MEMBER_FLOOR;
  if (membersRaw !== undefined) {
    members = Number(membersRaw);
    if (!Number.isInteger(members) || members < 1) {
      throw new CommandError(`Invalid --members '${membersRaw}' (expected a positive integer)`, {
        code: 'BAD_ARGUMENT',
        detail: USAGE,
      });
    }
  }

  return {
    name,
    slug,
    ownerEmail: normalizeEmail(ownerEmailRaw),
    members,
    rosterPath,
    dryRun: boolFlag(args.flags, 'dry-run'),
  };
}

/**
 * Parse a member roster file (a JSON array of `{ name, email, plan? }`). Throws
 * {@link CommandError} `BAD_ROSTER` on malformed JSON or a row missing name/email.
 */
export function parseRoster(text: string): RosterRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new CommandError('Roster file is not valid JSON', {
      code: 'BAD_ROSTER',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
  if (!Array.isArray(parsed)) {
    throw new CommandError('Roster file must be a JSON array of members', {
      code: 'BAD_ROSTER',
      detail: 'Expected [{ "name": "…", "email": "…", "plan": "…"? }, …]',
    });
  }
  return parsed.map((row, i) => {
    const record = row as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const email = typeof record.email === 'string' ? normalizeEmail(record.email) : '';
    if (!name || !email) {
      throw new CommandError(`Roster row ${i + 1} is missing a name or email`, {
        code: 'BAD_ROSTER',
        detail: row,
      });
    }
    const plan =
      typeof record.plan === 'string' && record.plan.trim() ? record.plan.trim() : undefined;
    return { name, email, plan };
  });
}

/**
 * Build a placeholder roster of `count` members when no real roster file is given.
 * Deterministic emails (`member-NN@<slug>.pilot`) keep the run idempotent, and the
 * plan is assigned round-robin across {@link DEFAULT_PLANS}.
 */
export function generatedRoster(count: number, slug: string): RosterRow[] {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return {
      name: `Pilot Member ${i + 1}`,
      email: `member-${n}@${slug}.pilot`,
      plan: DEFAULT_PLANS[i % DEFAULT_PLANS.length]!.name,
    };
  });
}

/** Resolve the plan a roster row sits on, falling back to a round-robin default. */
export function resolvePlanName(row: RosterRow, index: number): string {
  if (row.plan && DEFAULT_PLANS.some((p) => p.name === row.plan)) {
    return row.plan;
  }
  return DEFAULT_PLANS[index % DEFAULT_PLANS.length]!.name;
}

/** A fixed past UTC anchor (~4 weeks ago) at `hour:00`, used as a template's `validFrom`. */
function anchorAtHourUtc(hour: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 28);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

export async function runOnboard(args: ParsedArgs): Promise<CommandResult> {
  const params = parseOnboardArgs(args);
  const roster = params.rosterPath
    ? parseRoster(readFileSync(params.rosterPath, 'utf8'))
    : generatedRoster(params.members, params.slug);

  // A dry run resolves the full plan without touching the database, so an operator
  // can eyeball what a real run would provision (and whether it clears the pilot bar).
  if (params.dryRun) {
    return {
      data: {
        dryRun: true,
        gym: { name: params.name, slug: params.slug },
        owner: params.ownerEmail,
        plans: DEFAULT_PLANS.map((p) => p.name),
        staff: DEFAULT_STAFF.length,
        classes: DEFAULT_CLASSES.map((c) => c.title),
        members: roster.length,
        meetsPilotFloor: roster.length >= PILOT_MEMBER_FLOOR,
      },
    };
  }

  const env = loadInfraEnv('local');
  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  const now = new Date();

  try {
    // ── Owner (must already exist; signs up through the real flow first) ──────
    const owner = await prisma.user.findUnique({
      where: { email: params.ownerEmail },
      select: { id: true, name: true },
    });
    if (!owner) {
      throw new CommandError(`No user with email '${params.ownerEmail}'`, {
        code: 'OWNER_NOT_FOUND',
        detail: 'The owner must sign up through the normal registration flow first, then re-run.',
      });
    }

    // ── Gym (upsert by slug; never re-home a gym owned by someone else) ───────
    const gym = await prisma.gym.upsert({
      where: { slug: params.slug },
      update: { name: params.name },
      create: { name: params.name, slug: params.slug },
      select: { id: true, ownerId: true },
    });
    if (gym.ownerId && gym.ownerId !== owner.id) {
      throw new CommandError(`Gym '${params.slug}' is already owned by another account`, {
        code: 'OWNER_MISMATCH',
        detail: { gymId: gym.id },
      });
    }
    await prisma.gym.update({ where: { id: gym.id }, data: { ownerId: owner.id } });
    await prisma.gymMember.upsert({
      where: { userId_gymId: { userId: owner.id, gymId: gym.id } },
      update: { role: Role.OWNER, status: GymMemberStatus.ACTIVE },
      create: {
        userId: owner.id,
        gymId: gym.id,
        role: Role.OWNER,
        status: GymMemberStatus.ACTIVE,
        joinedAt: now,
      },
    });

    // ── Staff (one ACTIVE membership per non-MEMBER role) ────────────────────
    let staffCount = 0;
    for (const staff of DEFAULT_STAFF) {
      const email = `${staff.emailLocal}@${params.slug}.pilot`;
      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: { name: staff.name, email, emailVerifiedAt: now },
        select: { id: true },
      });
      await prisma.gymMember.upsert({
        where: { userId_gymId: { userId: user.id, gymId: gym.id } },
        update: { role: staff.role, status: GymMemberStatus.ACTIVE },
        create: {
          userId: user.id,
          gymId: gym.id,
          role: staff.role,
          status: GymMemberStatus.ACTIVE,
          joinedAt: now,
        },
      });
      staffCount += 1;
    }

    // ── Subscription plans (upsert by (gymId, name)) ─────────────────────────
    const planByName = new Map<string, { id: string; priceAmount: number }>();
    for (const spec of DEFAULT_PLANS) {
      const existing = await prisma.subscriptionPlan.findFirst({
        where: { gymId: gym.id, name: spec.name },
        select: { id: true, priceAmount: true },
      });
      if (existing) {
        planByName.set(spec.name, existing);
        continue;
      }
      const created = await prisma.subscriptionPlan.create({
        data: {
          gymId: gym.id,
          name: spec.name,
          priceAmount: spec.priceAmount,
          currency: 'GEL',
          interval: SubscriptionInterval.MONTH,
          popular: spec.popular,
        },
        select: { id: true, priceAmount: true },
      });
      planByName.set(spec.name, created);
    }

    // ── Class schedule (templates → 4-week horizon via the shared generator) ──
    for (const cls of DEFAULT_CLASSES) {
      const existing = await prisma.classTemplate.findFirst({
        where: { gymId: gym.id, title: cls.title },
        select: { id: true },
      });
      if (existing) {
        continue;
      }
      await prisma.classTemplate.create({
        data: {
          gymId: gym.id,
          title: cls.title,
          category: cls.category,
          capacity: cls.capacity,
          durationMinutes: cls.durationMinutes,
          rrule: cls.rrule,
          color: cls.color,
          validFrom: anchorAtHourUtc(cls.hourUtc),
        },
      });
    }
    const generation = await generateClassInstances(prisma);

    // ── Members + one ACTIVE subscription each ───────────────────────────────
    let memberCount = 0;
    let subscriptionCount = 0;
    for (let i = 0; i < roster.length; i++) {
      const row = roster[i]!;
      const user = await prisma.user.upsert({
        where: { email: row.email },
        update: { name: row.name },
        create: { name: row.name, email: row.email, emailVerifiedAt: now },
        select: { id: true },
      });
      const membership = await prisma.gymMember.upsert({
        where: { userId_gymId: { userId: user.id, gymId: gym.id } },
        update: { role: Role.MEMBER, status: GymMemberStatus.ACTIVE },
        create: {
          userId: user.id,
          gymId: gym.id,
          role: Role.MEMBER,
          status: GymMemberStatus.ACTIVE,
          joinedAt: now,
        },
        select: { id: true },
      });
      memberCount += 1;

      const plan = planByName.get(resolvePlanName(row, i));
      // The partial unique enforces one live subscription per member; guard on it
      // so a re-run never stacks a second ACTIVE row.
      const liveSub = await prisma.subscription.findFirst({
        where: {
          gymId: gym.id,
          memberId: membership.id,
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.FROZEN],
          },
        },
        select: { id: true },
      });
      if (!liveSub && plan) {
        const period = initialBillingPeriod(now, SubscriptionInterval.MONTH);
        await prisma.subscription.create({
          data: {
            gymId: gym.id,
            planId: plan.id,
            memberId: membership.id,
            status: SubscriptionStatus.ACTIVE,
            priceAmount: plan.priceAmount,
            currency: 'GEL',
            interval: SubscriptionInterval.MONTH,
            currentPeriodStart: period.currentPeriodStart,
            currentPeriodEnd: period.currentPeriodEnd,
          },
        });
        subscriptionCount += 1;
      }
    }

    // The pilot go-live bar is about the gym's *total* active membership, not just
    // what this run provisioned — so a roster top-up run reports the true standing.
    const activeMembers = await prisma.gymMember.count({
      where: { gymId: gym.id, role: Role.MEMBER, status: GymMemberStatus.ACTIVE },
    });
    const classInstances = await prisma.classInstance.count({ where: { gymId: gym.id } });

    return {
      data: {
        gym: { id: gym.id, slug: params.slug, name: params.name },
        owner: { id: owner.id, email: params.ownerEmail },
        plans: planByName.size,
        staff: staffCount,
        members: memberCount,
        subscriptions: subscriptionCount,
        activeMembers,
        classInstances,
        generatedInstances: generation.instancesCreated,
        meetsPilotFloor: activeMembers >= PILOT_MEMBER_FLOOR,
      },
    };
  } finally {
    await prisma.$disconnect();
  }
}
