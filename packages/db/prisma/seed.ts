// Development seed for @fit/db.
//
// Inserts two gyms and demonstrates the core multi-tenancy invariant from T2.1:
// a single user can be a member of N gyms with a DIFFERENT role in each. The
// composite unique on (userId, gymId) means a second membership for the same
// pair is rejected — re-running this seed is idempotent via upsert.
//
// Run with:  pnpm db:seed   (or `fit db seed`, or `prisma db seed`)

import { randomUUID } from 'node:crypto';
import {
  prisma,
  generateClassInstances,
  subscriptionInvoiceDescription,
  Role,
  GymMemberStatus,
  InstanceStatus,
  ClassPricingRule,
  ClassTypeStatus,
  BookingStatus,
  CheckInMethod,
  InvoiceStatus,
  InvoiceType,
  LocationStatus,
  NotificationCategory,
  OrderStatus,
  PackageBillingInterval,
  PackagePlanStatus,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
  ServiceSessionStatus,
  ServiceStatus,
  ServiceType,
  SubscriptionInterval,
  SubscriptionStatus,
  TrainerStatus,
} from '../index';
// The invoice *reference* rule, imported rather than re-stated.
//
// `prisma/invoice-number.ts` warns in as many words against a second copy of it:
// the rule moved to `@fit/types` so the console's Settings → Invoicing preview and
// the API's mint site compose a number with ONE function. A seed that hand-rolled
// `"INV-2026-1000"` would be the third copy and the first one nobody tests — and it
// would silently stop matching the moment a gym changed its prefix or shape. So
// `@fit/db` takes a workspace **devDependency** on `@fit/types` (dev, because only
// this seed script needs it; `index.ts` — what the apps actually consume — does
// not). No cycle: `@fit/types` depends on `zod` and nothing else, and
// `packages/utils` already depends on it the same way.
import {
  formatInvoiceNumber,
  gymSettingsStoredSchema,
  invoiceNumberCarriesYear,
  type InvoiceNumbering,
} from '@fit/types';

/**
 * Shared dev password for the seeded login fixtures (`alex@example.com` /
 * `sam@example.com`): **Test1234!**. This is an argon2id hash of that string
 * (the same scheme the API's auth service verifies against), so the seed needs
 * no argon2 dependency of its own. Dev/staging only — never a real credential.
 */
const DEV_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$jCGqxpstwpznNArLCpqm2A$nrUjuzLd6+rpCm7GP/sDQoVxyVI3e2/OoLtieTHsBq8';

async function main() {
  // Two tenants.
  const downtown = await prisma.gym.upsert({
    where: { slug: 'downtown' },
    update: {},
    create: { name: 'Downtown Strength', slug: 'downtown' },
  });

  const riverside = await prisma.gym.upsert({
    where: { slug: 'riverside' },
    update: {},
    create: { name: 'Riverside Fitness', slug: 'riverside' },
  });

  // Branches, before anything that hangs off one. Both gyms get theirs here (not
  // inside `enrichDowntown`) because the class occurrences scheduled further down
  // need a branch to point at, and because `riverside` — which gets no demo
  // enrichment — must still come out of a fresh `migrate reset` with a branch of
  // its own rather than relying on the backfill migration having run against
  // pre-existing rows.
  const downtownLocationIds = await ensureBranches(downtown.id, DOWNTOWN_BRANCHES);
  const riversideLocationIds = await ensureBranches(riverside.id, RIVERSIDE_BRANCHES);

  // Home branches for the fixture logins below. Every seeded membership gets one:
  // `GymMember.locationId` is nullable only until the write paths require it, and a
  // freshly reset database that already contains unattributed members is a bad
  // starting point for the very filter this data exists to exercise.
  const downtownMainBranch = downtownLocationIds[0] ?? null;
  const downtownSecondBranch = downtownLocationIds[1] ?? downtownMainBranch;
  const riversideMainBranch = riversideLocationIds[0] ?? null;

  // One shared user who belongs to both gyms with different roles.
  const alex = await prisma.user.upsert({
    where: { email: 'alex@example.com' },
    update: { passwordHash: DEV_PASSWORD_HASH, emailVerifiedAt: new Date() },
    create: {
      email: 'alex@example.com',
      name: 'Alex Owner',
      passwordHash: DEV_PASSWORD_HASH,
      emailVerifiedAt: new Date(),
    },
  });

  // OWNER at Downtown, TRAINER at Riverside — proves per-gym roles.
  const alexDowntown = await prisma.gymMember.upsert({
    where: { userId_gymId: { userId: alex.id, gymId: downtown.id } },
    update: { role: Role.OWNER, status: GymMemberStatus.ACTIVE, locationId: downtownMainBranch },
    create: {
      userId: alex.id,
      gymId: downtown.id,
      role: Role.OWNER,
      status: GymMemberStatus.ACTIVE,
      locationId: downtownMainBranch,
    },
    select: { id: true },
  });

  const alexRiverside = await prisma.gymMember.upsert({
    where: { userId_gymId: { userId: alex.id, gymId: riverside.id } },
    update: { role: Role.TRAINER, status: GymMemberStatus.ACTIVE, locationId: riversideMainBranch },
    create: {
      userId: alex.id,
      gymId: riverside.id,
      role: Role.TRAINER,
      status: GymMemberStatus.ACTIVE,
      locationId: riversideMainBranch,
    },
    select: { id: true },
  });

  // Work assignments for the two fixture logins. Every non-MEMBER membership gets
  // at least one, for the same reason every membership gets a home branch: a fresh
  // database whose staff are rostered nowhere makes "who works at branch X" answer
  // nobody at every branch, which is indistinguishable from a broken filter. The
  // owner covers the whole business, so both downtown branches; alex coaches at
  // riverside's only branch.
  await assignBranches(
    downtown.id,
    alexDowntown.id,
    downtownLocationIds.map((_, index) => index),
    downtownLocationIds,
  );
  await assignBranches(riverside.id, alexRiverside.id, [0], riversideLocationIds);

  // Mark each gym's owner now that the owning user exists.
  await prisma.gym.update({ where: { id: downtown.id }, data: { ownerId: alex.id } });

  // A second user, invited as a member of one gym only.
  const sam = await prisma.user.upsert({
    where: { email: 'sam@example.com' },
    update: { passwordHash: DEV_PASSWORD_HASH, emailVerifiedAt: new Date() },
    create: {
      email: 'sam@example.com',
      name: 'Sam Member',
      passwordHash: DEV_PASSWORD_HASH,
      emailVerifiedAt: new Date(),
    },
  });

  // ACTIVE MEMBER at Downtown — the member-portal login fixture (log in as
  // sam@example.com to exercise the member app against the `downtown` tenant).
  // Homed at the SECOND branch on purpose: the 14 demo members alternate and come
  // out 7/7, so the one hand-written member fixture is the tie-breaker. Landing him
  // on Saburtalo means logging in as sam and selecting the default branch shows a
  // roster he is absent from — the cheapest possible check that the filter is real.
  await prisma.gymMember.upsert({
    where: { userId_gymId: { userId: sam.id, gymId: downtown.id } },
    update: { role: Role.MEMBER, status: GymMemberStatus.ACTIVE, locationId: downtownSecondBranch },
    create: {
      userId: sam.id,
      gymId: downtown.id,
      role: Role.MEMBER,
      status: GymMemberStatus.ACTIVE,
      locationId: downtownSecondBranch,
    },
  });

  await prisma.gymMember.upsert({
    where: { userId_gymId: { userId: sam.id, gymId: riverside.id } },
    update: { role: Role.MEMBER, status: GymMemberStatus.INVITED, locationId: riversideMainBranch },
    create: {
      userId: sam.id,
      gymId: riverside.id,
      role: Role.MEMBER,
      status: GymMemberStatus.INVITED,
      locationId: riversideMainBranch,
    },
  });

  // A few inbox notifications for the member-portal fixture (T6.10) so the bell
  // renders with a live unread badge + list out of the box: two unread, one
  // already read. Keyed on (gymId, userId, title) so re-running the seed is
  // idempotent (notifications have no natural unique column). Producers that emit
  // these in real flows are separate Phase-8 tasks (T8.6/T8.7/T8.8); this is
  // demo/dev data only.
  const SEED_NOTIFICATIONS = [
    {
      category: NotificationCategory.BOOKING,
      title: 'Booking confirmed',
      body: 'Morning HIIT · Mon 08:00 with Coach Nia',
      href: '/bookings',
      readAt: null as Date | null,
    },
    {
      category: NotificationCategory.BILLING,
      title: 'Membership renews soon',
      body: 'Your Pro plan renews on the 1st — nothing to do.',
      href: '/account/membership',
      readAt: null as Date | null,
    },
    {
      category: NotificationCategory.SYSTEM,
      title: 'Welcome to FormaCore',
      body: 'Browse classes, book a spot, and check in with your QR code.',
      href: null as string | null,
      readAt: new Date('2026-06-01T09:00:00.000Z') as Date | null,
    },
  ];
  for (const n of SEED_NOTIFICATIONS) {
    const exists = await prisma.notification.findFirst({
      where: { gymId: downtown.id, userId: sam.id, title: n.title },
      select: { id: true },
    });
    if (!exists) {
      await prisma.notification.create({
        data: {
          gymId: downtown.id,
          userId: sam.id,
          category: n.category,
          title: n.title,
          body: n.body,
          href: n.href,
          readAt: n.readAt,
        },
      });
    }
  }

  // A platform SUPER_ADMIN fixture for local dev / E2E so the operator console
  // is reachable out of the box. Gated to non-production: never seed a standing
  // super-admin into a real database. In production the first admin is made by
  // registering a user and running `fit admin grant --email <email>`.
  //
  // It carries {@link DEV_PASSWORD_HASH} like every other seed user. It used to
  // be created WITHOUT a password, on the reasoning that a dev would mint its
  // session with `fit token --role SUPER_ADMIN` — but the operator console owns
  // a sign-in of its own now (its cookies are host-only, so no other surface can
  // mint a session for it), and a password-less fixture cannot get through a
  // password form. `fit token` still works for scripted/API use.
  if (process.env.NODE_ENV !== 'production') {
    await prisma.user.upsert({
      where: { email: 'superadmin@fit.local' },
      update: { isSuperAdmin: true, passwordHash: DEV_PASSWORD_HASH },
      create: {
        email: 'superadmin@fit.local',
        name: 'Platform Admin',
        isSuperAdmin: true,
        passwordHash: DEV_PASSWORD_HASH,
        emailVerifiedAt: new Date(),
      },
    });
  }

  // A recurring class template + its first occurrences (T5.1). Demonstrates the
  // scheduling core: one ClassTemplate (the RRULE *rule*) expands into concrete
  // ClassInstance occurrences. Idempotent — materialised once per gym, keyed on
  // (gymId, title) since a template has no natural unique column.
  const CLASS_TITLE = 'Morning HIIT';
  // The default branch: this template predates the demo enrichment and is the one
  // the member-portal fixtures reference, so it runs at the gym's flagship.
  const hiitLocationId = downtownLocationIds[0] ?? null;
  const existingTemplate = await prisma.classTemplate.findFirst({
    where: { gymId: downtown.id, title: CLASS_TITLE },
  });

  if (existingTemplate) {
    // Re-point a template seeded before branches existed (it carried no location).
    await prisma.classTemplate.update({
      where: { id: existingTemplate.id },
      data: { locationId: hiitLocationId },
    });
  }

  if (!existingTemplate) {
    const template = await prisma.classTemplate.create({
      data: {
        gymId: downtown.id,
        title: CLASS_TITLE,
        description: 'High-intensity interval training to start the day.',
        category: 'Conditioning',
        locationId: hiitLocationId,
        capacity: 20,
        durationMinutes: 60,
        // Every Mon/Wed/Fri — the canonical weekly RRULE the generator (T5.3) expands.
        rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
        color: '#ef4444',
        // 07:00 UTC anchor: the generator materialises future occurrences at the
        // template's `validFrom` time-of-day, so a 07:00 anchor keeps the 4-week
        // horizon full of realistic early-morning classes rather than midnight ones.
        validFrom: new Date('2026-06-08T07:00:00.000Z'),
      },
    });

    // Materialise the first 4 weekly occurrences (07:00–08:00 UTC) so the
    // calendar and booking flows have data to render against in local dev.
    const firstStart = new Date('2026-06-08T07:00:00.000Z'); // a Monday
    await prisma.classInstance.createMany({
      data: Array.from({ length: 4 }, (_, i) => {
        const startsAt = new Date(firstStart);
        startsAt.setUTCDate(startsAt.getUTCDate() + i * 7);
        const endsAt = new Date(startsAt);
        endsAt.setUTCMinutes(endsAt.getUTCMinutes() + template.durationMinutes);
        return {
          gymId: downtown.id,
          templateId: template.id,
          startsAt,
          endsAt,
          locationId: hiitLocationId,
          status: InstanceStatus.SCHEDULED,
        };
      }),
    });
  }

  // Class-type catalogue (the reusable "kinds" of class staff schedule single
  // occurrences of). Idempotent — keyed on (gymId, name). Seeds a realistic
  // catalogue so the Class Types tab and the schedule's "Add Class" type-picker
  // open onto data; a couple of single occurrences are scheduled from a type
  // below to exercise the type→occurrence path alongside the template one.
  const CLASS_TYPES = [
    {
      name: 'Boxing',
      durationMinutes: 60,
      capacity: 16,
      minAttendance: 4,
      color: '#ef4444',
    },
    {
      name: 'Yoga Flow',
      durationMinutes: 75,
      capacity: 20,
      minAttendance: 3,
      color: '#10b981',
    },
    {
      name: 'CrossFit',
      durationMinutes: 60,
      capacity: 14,
      minAttendance: 5,
      color: '#ec4899',
    },
    {
      name: 'Spin',
      durationMinutes: 45,
      capacity: 24,
      minAttendance: 6,
      color: '#7c3aed',
    },
    {
      name: 'Pilates',
      durationMinutes: 50,
      capacity: 18,
      minAttendance: null,
      color: '#f59e0b',
    },
  ] as const;

  const classTypeIdByName = new Map<string, string>();
  for (const type of CLASS_TYPES) {
    const existing = await prisma.classType.findFirst({
      where: { gymId: downtown.id, name: type.name },
      select: { id: true },
    });
    const id =
      existing?.id ??
      (
        await prisma.classType.create({
          data: {
            gymId: downtown.id,
            name: type.name,
            durationMinutes: type.durationMinutes,
            capacity: type.capacity,
            minAttendance: type.minAttendance ?? null,
            color: type.color,
            pricingRule: ClassPricingRule.FREE,
            status: ClassTypeStatus.ACTIVE,
          },
          select: { id: true },
        })
      ).id;
    classTypeIdByName.set(type.name, id);
  }

  // A couple of single occurrences scheduled directly from a type (no template),
  // this week, at UTC hours inside the 06:00–22:00 calendar. Idempotent on
  // (gymId, classTypeId, startsAt). `branch` indexes {@link DOWNTOWN_BRANCHES}:
  // these carry their own `locationId` because a template-less occurrence has no
  // template location for the schedule filter to fall back to.
  const singleOccurrences = [
    { name: 'Boxing', dayOffset: 0, hour: 20, minutes: 60, capacity: 16, branch: 1 },
    { name: 'Pilates', dayOffset: 1, hour: 10, minutes: 50, capacity: 18, branch: 0 },
  ];
  for (const occ of singleOccurrences) {
    const classTypeId = classTypeIdByName.get(occ.name);
    if (!classTypeId) continue;
    const startsAt = new Date();
    startsAt.setUTCDate(startsAt.getUTCDate() + occ.dayOffset);
    startsAt.setUTCHours(occ.hour, 0, 0, 0);
    const existing = await prisma.classInstance.findFirst({
      where: { gymId: downtown.id, classTypeId, startsAt },
      select: { id: true },
    });
    if (!existing) {
      const endsAt = new Date(startsAt.getTime() + occ.minutes * 60 * 1000);
      await prisma.classInstance.create({
        data: {
          gymId: downtown.id,
          classTypeId,
          startsAt,
          endsAt,
          locationId: downtownLocationIds[occ.branch] ?? null,
          status: InstanceStatus.SCHEDULED,
        },
      });
    }
  }

  // ── Demo / pilot enrichment for the `downtown` gym (T10.3) ────────────────
  //
  // Populates a realistic, tenant-scoped dataset so a pilot gym opens onto a fully
  // furnished console: subscription plans + members on them, captured payments
  // across the last ~30 days, trainers, today's classes with bookings, today's
  // check-ins, staff login fixtures (one per role), the retail shop catalogue, and
  // the PT / class-pass packages — all of it split across the gym's two branches
  // (created above) so the console's location filter has something real to narrow.
  // The forward 4-week class schedule is materialised separately below. Every
  // insert is guarded by existence/upsert — idempotent and non-destructive, safe
  // to re-run, never deletes.
  await enrichDowntown(downtown.id, downtownLocationIds);

  // Three home-screen banners for the member app's carousel (T1.16), one of them
  // deliberately not live — see `ensureBanners`.
  await ensureBanners(downtown.id);

  // A few 1:1 PT sessions this week so the PT Calendar tab opens onto data.
  // Idempotent on (gymId, trainerId, startsAt); skipped if the gym has no trainer
  // or class type yet.
  //
  // Since Stage 6 each one names the BRANCH IT RUNS AT — a figure about a place,
  // so it gets its own column rather than being resolved through the coach's base
  // branch. That distinction is what this fixture exists to exercise: Sandro K. is
  // rostered at both sites, so his two sessions sit at different branches, and a
  // seed that hopped through his home branch would file them both at the flagship.
  //
  // The sessions are deliberately 3/2 rather than an even split — a 50/50 fixture
  // cannot tell a working branch filter from a coincidence.
  const DEMO_PT_SESSIONS = [
    { trainer: 'Ana G.', dayOffset: 0, hour: 9, minutes: 60, branch: 0 },
    { trainer: 'Levan M.', dayOffset: 1, hour: 11, minutes: 45, branch: 1 },
    { trainer: 'Sandro K.', dayOffset: 2, hour: 14, minutes: 45, branch: 0 },
    { trainer: 'Sandro K.', dayOffset: 3, hour: 16, minutes: 60, branch: 1 },
    { trainer: 'Nika B.', dayOffset: 4, hour: 18, minutes: 60, branch: 0 },
  ] as const;
  // A PT session is a trainer + a workout type (class type) — no member. Attach the
  // first seeded class type so the calendar shows named blocks.
  const ptClassTypeId = classTypeIdByName.values().next().value ?? null;
  if (ptClassTypeId) {
    for (const pt of DEMO_PT_SESSIONS) {
      const trainer = await prisma.trainer.findFirst({
        where: { gymId: downtown.id, name: pt.trainer, status: TrainerStatus.ACTIVE },
        select: { id: true },
      });
      const locationId = downtownLocationIds[pt.branch] ?? downtownLocationIds[0] ?? null;
      if (!trainer) {
        continue;
      }
      const startsAt = new Date();
      startsAt.setUTCDate(startsAt.getUTCDate() + pt.dayOffset);
      startsAt.setUTCHours(pt.hour, 0, 0, 0);
      const existing = await prisma.ptSession.findFirst({
        where: { gymId: downtown.id, trainerId: trainer.id, startsAt },
        select: { id: true, classTypeId: true, locationId: true },
      });
      if (!existing) {
        await prisma.ptSession.create({
          data: {
            gymId: downtown.id,
            trainerId: trainer.id,
            classTypeId: ptClassTypeId,
            startsAt,
            endsAt: new Date(startsAt.getTime() + pt.minutes * 60 * 1000),
            status: InstanceStatus.SCHEDULED,
            locationId,
          },
        });
      } else if (!existing.classTypeId || !existing.locationId) {
        // Backfill a workout type onto a legacy row that predates the member→type
        // change, and a branch onto one the Stage 6 migration could only put on the
        // default. Narrowed to rows that have neither, so a session an operator
        // moved to another branch is never dragged back.
        await prisma.ptSession.update({
          where: { id: existing.id },
          data: {
            classTypeId: existing.classTypeId ?? ptClassTypeId,
            locationId: existing.locationId ?? locationId,
          },
        });
      }
    }
  }

  // Materialise every active template's occurrences out to the standard 4-week
  // booking horizon (the same pass the T5.3 cron runs), so a pilot demo opens onto
  // a full forward schedule rather than just today's classes. Idempotent — it only
  // adds occurrences newly inside the window, so re-seeding never duplicates.
  const generation = await generateClassInstances(prisma);

  // Stamp the generated occurrences with their template's branch. The generator
  // does not copy `locationId` (an occurrence reaches a branch through its
  // template, and `/admin/schedule` filters on either), but leaving 100+ rows
  // unattributed makes every direct read of `ClassInstance.locationId` — occupancy,
  // per-branch class counts — look empty in dev. Narrowed to rows that have no
  // branch of their own, so an occurrence explicitly moved to another branch is
  // never dragged back to its template's.
  const locatedTemplates = await prisma.classTemplate.findMany({
    where: { locationId: { not: null } },
    select: { id: true, locationId: true },
  });
  for (const template of locatedTemplates) {
    await prisma.classInstance.updateMany({
      where: { templateId: template.id, locationId: null },
      data: { locationId: template.locationId },
    });
  }

  const memberships = await prisma.gymMember.findMany({
    where: { userId: alex.id },
    select: { gymId: true, role: true },
  });

  const classInstanceCount = await prisma.classInstance.count({
    where: { gymId: downtown.id },
  });

  const downtownMembers = await prisma.gymMember.count({
    where: { gymId: downtown.id, role: Role.MEMBER },
  });
  const downtownStaff = await prisma.gymMember.count({
    where: { gymId: downtown.id, role: { not: Role.MEMBER } },
  });
  const downtownProducts = await prisma.product.count({ where: { gymId: downtown.id } });
  const downtownPackages = await prisma.packagePlan.count({ where: { gymId: downtown.id } });
  const downtownCheckInsToday = await prisma.checkIn.count({
    where: { gymId: downtown.id, checkedInAt: { gte: startOfToday() } },
  });
  // Printed as `live/total` because the two numbers are meant to differ: one seeded
  // banner is parked, so an equal pair means `GET /banners` has stopped filtering.
  const downtownBanners = await prisma.banner.count({ where: { gymId: downtown.id } });
  const downtownBannersLive = await prisma.banner.count({
    where: { gymId: downtown.id, isActive: true },
  });

  // Branch roster, marking the default with a `*`. Printed because "exactly one
  // default per gym" is the invariant the whole location filter is built on, and a
  // seed run is the cheapest place to see it held.
  const branches = await prisma.location.findMany({
    where: { gymId: { in: [downtown.id, riverside.id] } },
    select: { id: true, gymId: true, name: true, isDefault: true },
    orderBy: [{ gymId: 'asc' }, { name: 'asc' }],
  });
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

  // The member roster split by home branch. Printed next to the branch roster
  // because a 14-0 split (or a row under `(none)`) is the signature of a seed that
  // ran before `GymMember.locationId` existed, and it is invisible otherwise.
  const membersByBranch = await prisma.gymMember.groupBy({
    by: ['locationId'],
    where: { gymId: downtown.id, role: Role.MEMBER },
    _count: { _all: true },
    orderBy: { locationId: 'asc' },
  });
  // Today's arrivals split by the branch they were recorded at. `CheckIn.locationId`
  // spent a long time as a scalar nothing wrote, so a run that lands every arrival
  // under `(none)` — or piles all nine on one branch — is the signature of a seed
  // predating the round-robin, and nothing else on this summary would show it.
  // Grouped on the same window as `downtownCheckInsToday` so the rows sum to it.
  const checkInsByBranch = await prisma.checkIn.groupBy({
    by: ['locationId'],
    where: { gymId: downtown.id, checkedInAt: { gte: startOfToday() } },
    _count: { _all: true },
    orderBy: { locationId: 'asc' },
  });

  // On-hand stock split by the branch that holds it. Summed in JS rather than by
  // `groupBy`, because a branch's total is its base count PLUS its variant counts,
  // and the variant counts live inside a JSON array no aggregate can reach — the
  // cost of the shape `ProductStock` chose, made visible here rather than hidden.
  //
  // Printed for the same reason as the two rows above it: a run that piles every
  // unit onto one branch, or lands them all under `(none)`, is the signature of a
  // seed predating Stage 4, and nothing else on this summary would show it. The
  // two branches are *meant* to disagree — that is the whole point of the split.
  const stockRows = await prisma.productStock.findMany({
    where: { gymId: downtown.id },
    select: { locationId: true, stock: true, variants: true },
  });
  const stockByBranch = new Map<string, { lines: number; units: number }>();
  for (const row of stockRows) {
    const counts = Array.isArray(row.variants) ? (row.variants as unknown[]) : [];
    const units =
      (row.stock ?? 0) +
      counts.reduce<number>((sum, n) => sum + (typeof n === 'number' ? n : 0), 0);
    const bucket = stockByBranch.get(row.locationId) ?? { lines: 0, units: 0 };
    bucket.lines += 1;
    bucket.units += units;
    stockByBranch.set(row.locationId, bucket);
  }

  // Takings split by the branch that earned them, net of refunds. Read off
  // `Payment.locationId` / `Refund.locationId` — the denormalised copies Stage 5
  // added — rather than through `order`, so this line exercises the exact columns
  // the revenue dashboards now filter on. If they ever disagree with the order's
  // branch, this is where it shows up: a run that lands every taking under
  // `(none)` means the seed wrote the order's branch and not the payment's.
  //
  // Deliberately NET. Refunds are the half a seed is most likely to leave
  // unattributed, and a gross-only line would hide that: the refunded till sale
  // sits at one branch, so a `(none)` in the refunded column is visible here and
  // nowhere else on this summary.
  //
  const [paymentsByBranch, refundsByBranch] = await Promise.all([
    prisma.payment.groupBy({
      by: ['locationId'],
      where: { gymId: downtown.id, status: PaymentStatus.CAPTURED },
      _sum: { amount: true },
      orderBy: { locationId: 'asc' },
    }),
    prisma.refund.groupBy({
      by: ['locationId'],
      where: { gymId: downtown.id },
      _sum: { amount: true },
      orderBy: { locationId: 'asc' },
    }),
  ]);
  const revenueByBranch = new Map<string | null, { taken: number; refunded: number }>();
  for (const row of paymentsByBranch) {
    const bucket = revenueByBranch.get(row.locationId) ?? { taken: 0, refunded: 0 };
    bucket.taken += row._sum.amount ?? 0;
    revenueByBranch.set(row.locationId, bucket);
  }
  for (const row of refundsByBranch) {
    const bucket = revenueByBranch.get(row.locationId) ?? { taken: 0, refunded: 0 };
    bucket.refunded += row._sum.amount ?? 0;
    revenueByBranch.set(row.locationId, bucket);
  }
  // Invoices split by the branch the billed member stood at when each was raised.
  //
  // A DIFFERENT column from the takings above and it must be read separately: an
  // invoice is attributed through the MEMBER (`Invoice.locationId`, frozen at issue
  // time) while a payment is attributed through the ORDER, so the two lines are not
  // expected to agree and a single "money by branch" row would hide that they are
  // answering different questions.
  //
  // The `(none)` row is the one to look for, and unlike everywhere else on this
  // summary it is EXPECTED: a seed with no `(none)` line here has lost its
  // unattributable invoice, and the "not attributable" placeholder on
  // `/payments/invoices` — plus the promise that such a row stays in the gym-wide
  // total while dropping out of every per-branch one — has nothing to render
  // against. A run where the two branches are level, or where one owns everything,
  // means the roster stopped alternating and the branch filter has quietly become a
  // no-op.
  const invoicesByBranch = await prisma.invoice.groupBy({
    by: ['locationId'],
    where: { gymId: downtown.id },
    _count: { _all: true },
    _sum: { amount: true },
    orderBy: { locationId: 'asc' },
  });

  // ── Stage 6: people and scheduling, per branch ──────────────────────────
  //
  // Five lines, because Stage 6 introduced two DIFFERENT shapes and a summary that
  // printed only one of them would hide the distinction the whole stage turns on.
  //
  //   * Staff and trainers are counted off `LocationStaff` — the many-to-many work
  //     roster. These rows OVERLAP: somebody who covers both sites appears under
  //     both, so the branch counts sum to MORE than the payroll. That is correct
  //     and is why the line says "assignment(s)" rather than "staff". A per-branch
  //     HEAD-COUNT is a different query, against `GymMember.locationId`, and is
  //     already printed as `downtownStaff`.
  //   * Services are DERIVED — a service carries no branch and is bookable wherever
  //     its staff member is rostered. Printing the derivation is the only dev
  //     coverage it has; a run that lands every service at every branch means the
  //     roster stopped differing and the filter has quietly become a no-op.
  //   * PT sessions and shifts are counted off their OWN `locationId`, because each
  //     happens at exactly one place. These PARTITION: they sum to the gym total.
  //
  // A `(none)` under shifts is the signature that matters most — it means a shift
  // whose free-text name resolved to no branch, the residual class the Stage 6
  // migration deliberately refuses to backfill.
  const [staffAssignmentsByBranch, ptSessionsByBranch, shiftsByBranch] = await Promise.all([
    prisma.locationStaff.groupBy({
      by: ['locationId'],
      where: { gymId: downtown.id },
      _count: { _all: true },
      orderBy: { locationId: 'asc' },
    }),
    prisma.ptSession.groupBy({
      by: ['locationId'],
      where: { gymId: downtown.id },
      _count: { _all: true },
      orderBy: { locationId: 'asc' },
    }),
    prisma.shiftSlot.groupBy({
      by: ['locationId'],
      where: { gymId: downtown.id },
      _count: { _all: true },
      orderBy: { locationId: 'asc' },
    }),
  ]);
  // Coaches and services reached through the roster, one query per branch. Counted
  // in a loop rather than a `groupBy` because both are RELATION filters — there is
  // no column to group on, which is the whole point of the derivation and the exact
  // cost the `Trainer` / `Service` model docs accept in exchange for not carrying a
  // third copy of the branch.
  const downtownBranches = branches.filter((b) => b.gymId === downtown.id);
  const derivedByBranch: Array<{ name: string; trainers: number; services: number }> = [];
  for (const branch of downtownBranches) {
    const rostered = { locationAssignments: { some: { locationId: branch.id } } };
    const [trainers, services] = await Promise.all([
      prisma.trainer.count({ where: { gymId: downtown.id, staff: { is: rostered } } }),
      prisma.service.count({ where: { gymId: downtown.id, staff: { is: rostered } } }),
    ]);
    derivedByBranch.push({ name: branch.name, trainers, services });
  }

  // Amounts are in the currency's MINOR units (tetri), as everywhere else in the
  // schema; divided only for the printed line.
  const gel = (minor: number): string => (minor / 100).toFixed(2);

  const slugByGymId = new Map([
    [downtown.id, downtown.slug],
    [riverside.id, riverside.slug],
  ]);

  console.log('[@fit/db] seed complete:', {
    gyms: [downtown.slug, riverside.slug],
    branches: branches.map(
      (b) => `${slugByGymId.get(b.gymId) ?? b.gymId}/${b.name}${b.isDefault ? ' *' : ''}`,
    ),
    alexRoles: memberships.map((m) => m.role),
    classInstances: `${classInstanceCount} (downtown, incl. ${generation.instancesCreated} generated to +4wk)`,
    downtownMembers,
    downtownMembersByBranch: membersByBranch.map(
      (row) =>
        `${row.locationId ? (branchNameById.get(row.locationId) ?? row.locationId) : '(none)'}: ${row._count._all}`,
    ),
    downtownStaff,
    // Overlapping by design — a coach rostered at both sites is counted twice, so
    // these sum to MORE than `downtownStaff`. See the comment above the query.
    downtownStaffAssignmentsByBranch: staffAssignmentsByBranch.map(
      (row) =>
        `${branchNameById.get(row.locationId) ?? row.locationId}: ${row._count._all} assignment(s)`,
    ),
    // Derived through the roster, not stored: neither model carries a branch.
    downtownTrainersAndServicesByBranch: derivedByBranch.map(
      (row) => `${row.name}: ${row.trainers} coach(es), ${row.services} service(s)`,
    ),
    downtownProducts,
    downtownBanners: `${downtownBannersLive}/${downtownBanners} active`,
    downtownStockByBranch: [...stockByBranch.entries()]
      .map(
        ([locationId, { lines, units }]) =>
          `${branchNameById.get(locationId) ?? locationId}: ${units} unit(s) across ${lines} line(s)`,
      )
      .sort(),
    downtownRevenueByBranch: [...revenueByBranch.entries()]
      .map(
        ([locationId, { taken, refunded }]) =>
          `${locationId ? (branchNameById.get(locationId) ?? locationId) : '(none)'}: ${gel(taken - refunded)} GEL net (${gel(taken)} taken − ${gel(refunded)} refunded)`,
      )
      .sort(),
    // Billed through the member, not the till — see the comment above the query.
    // A `(none)` row here is the "not attributable" invoice and is meant to be
    // present.
    downtownInvoicesByBranch: invoicesByBranch
      .map(
        (row) =>
          `${row.locationId ? (branchNameById.get(row.locationId) ?? row.locationId) : '(none)'}: ${row._count._all} invoice(s), ${gel(row._sum.amount ?? 0)} GEL billed`,
      )
      .sort(),
    downtownPackages,
    downtownCheckInsToday,
    downtownCheckInsTodayByBranch: checkInsByBranch.map(
      (row) =>
        `${row.locationId ? (branchNameById.get(row.locationId) ?? row.locationId) : '(none)'}: ${row._count._all}`,
    ),
    // Both partition: one session and one shift each happen at exactly one place,
    // so these sum to the gym total. A `(none)` under shifts is a rota entry whose
    // typed branch name resolved to nothing — the residual class Stage 6 refuses to
    // guess at, and the one row on this summary that wants a human.
    downtownPtSessionsByBranch: ptSessionsByBranch.map(
      (row) =>
        `${row.locationId ? (branchNameById.get(row.locationId) ?? row.locationId) : '(none)'}: ${row._count._all}`,
    ),
    downtownShiftsByBranch: shiftsByBranch.map(
      (row) =>
        `${row.locationId ? (branchNameById.get(row.locationId) ?? row.locationId) : '(none)'}: ${row._count._all}`,
    ),
    superAdmin:
      process.env.NODE_ENV !== 'production' ? 'superadmin@fit.local' : '(skipped in prod)',
  });
}

/* -------------------------------------------------------------------------- */
/*  Demo enrichment                                                            */
/* -------------------------------------------------------------------------- */

/** Start of the current calendar day in the server's zone. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** `n` days before now (local zone), preserving the current time-of-day. */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/** Today at `hour:minute` (local zone) — for today's class + check-in timestamps. */
function todayAt(hour: number, minute = 0): Date {
  const d = startOfToday();
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * A fixed past UTC anchor (~4 weeks ago) at `hour:00`. Used as a demo class
 * template's `validFrom`: the T5.3 generator materialises future occurrences at
 * the template's `validFrom` time-of-day (UTC), so anchoring here keeps the
 * generated 4-week horizon at a realistic clock hour. On a UTC host this lands
 * today's generated occurrence on the same instant as the explicit `todayAt(hour)`
 * instance, which the idempotent generator then skips.
 */
function pastUtcAnchorAtHour(hour: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 28);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

/**
 * The demo catalogue of subscription plans the dashboard's plan-mix renders. Each
 * is upserted by (gymId, name) so re-running the seed never duplicates a plan and
 * never re-prices an existing one it didn't create.
 */
const DEMO_PLANS = [
  { name: 'Premium', priceAmount: 12000, interval: SubscriptionInterval.MONTH, popular: true },
  { name: 'Standard', priceAmount: 7500, interval: SubscriptionInterval.MONTH, popular: false },
  { name: 'PT Pack', priceAmount: 20000, interval: SubscriptionInterval.MONTH, popular: false },
  { name: 'Student', priceAmount: 4500, interval: SubscriptionInterval.MONTH, popular: false },
  { name: 'Trial', priceAmount: 0, interval: SubscriptionInterval.MONTH, popular: false },
] as const;

/** The demo members: name, email, and the plan they sit on. */
const DEMO_MEMBERS: ReadonlyArray<{ name: string; plan: (typeof DEMO_PLANS)[number]['name'] }> = [
  { name: 'Nino Kapanadze', plan: 'Premium' },
  { name: 'Giorgi Beridze', plan: 'Premium' },
  { name: 'Mariam Tsiklauri', plan: 'Premium' },
  { name: 'Luka Gelashvili', plan: 'Standard' },
  { name: 'Tamar Chkheidze', plan: 'Standard' },
  { name: 'Davit Kvaratskhelia', plan: 'Standard' },
  { name: 'Salome Meladze', plan: 'Standard' },
  { name: 'Irakli Chubinidze', plan: 'PT Pack' },
  { name: 'Ana Dolidze', plan: 'PT Pack' },
  { name: 'Nika Bakradze', plan: 'Student' },
  { name: 'Elene Gogoladze', plan: 'Student' },
  { name: 'Sandro Maisuradze', plan: 'Student' },
  { name: 'Keti Ramishvili', plan: 'Trial' },
  { name: 'Vato Lomidze', plan: 'Trial' },
];

/**
 * The demo trainers the schedule + trainer index render.
 *
 * `base` is the branch the coach is on the books at (their staff row's
 * `GymMember.locationId`); `branches` is every branch they are ROSTERED at, in
 * {@link DOWNTOWN_BRANCHES} order — the {@link LocationStaff} rows Stage 6 of
 * multi-branch replaced `assignedLocationIds` with.
 *
 * Deliberately uneven, and deliberately including one coach who covers BOTH sites.
 * A roster where everybody works everywhere exercises nothing, and a roster where
 * everybody works at exactly one place hides the whole reason the assignment is a
 * join table rather than a column: Sandro is the row that proves "who works here"
 * overlaps between branches while "who is BASED here" still partitions.
 *
 * `base` is always one of `branches` — a coach on the books somewhere they are not
 * rostered would be a contradiction the schema cannot catch, so the seed does not
 * write one. It matches {@link DEMO_TODAY_CLASSES} too: every demo class runs at a
 * branch its trainer is actually rostered at.
 */
const DEMO_TRAINERS = [
  { name: 'Ana G.', base: 0, branches: [0] },
  { name: 'Levan M.', base: 1, branches: [1] },
  { name: 'Sandro K.', base: 0, branches: [0, 1] },
  { name: 'Nika B.', base: 1, branches: [1] },
] as const;

/**
 * One day of a branch's opening hours, in the shape `locationHoursSchema`
 * (`@fit/types`, `locations-admin.ts`) validates and the admin form edits:
 * `closed` shuts the day (times ignored), otherwise `open`/`close` are `HH:MM`
 * 24-hour times with `close` after `open` — or exactly `'00:00'`, the schema's
 * `MIDNIGHT_CLOSE`, which means midnight at the *end* of the day.
 *
 * `@fit/db` deliberately does not depend on `@fit/types` (the seed would drag a
 * Zod runtime into the migration toolchain), so the shape is restated here. The
 * `hours` column is `Json`; a value that does not parse would surface as an empty
 * admin form rather than an error, which is exactly the state this seed replaces.
 */
type SeedDayHours = { closed: boolean; open: string; close: string };

/** A full Monday-first week of {@link SeedDayHours}, one per weekday key. */
type SeedWeekHours = Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', SeedDayHours>;

/** Build a week from a weekday window, a Saturday window, and a Sunday window. */
function week(
  weekday: [string, string],
  saturday: [string, string] | null,
  sunday: [string, string] | null,
): SeedWeekHours {
  const day = (window: [string, string] | null): SeedDayHours =>
    window
      ? { closed: false, open: window[0], close: window[1] }
      : // A closed day still carries times: the schema defaults them and the admin
        // form renders the inputs, disabled, at whatever it is given.
        { closed: true, open: '09:00', close: '17:00' };
  return {
    mon: day(weekday),
    tue: day(weekday),
    wed: day(weekday),
    thu: day(weekday),
    fri: day(weekday),
    sat: day(saturday),
    sun: day(sunday),
  };
}

/**
 * A demo branch — a whole operating unit, not a room. `legacyName` is the name
 * this branch used to be seeded under, so an existing dev database migrates in
 * place (rename + fill in the profile) instead of accumulating a second, parallel
 * set of locations while the old rows keep every class template and check-in
 * pointing at them.
 */
type SeedBranch = {
  name: string;
  legacyName?: string;
  address: string;
  phone: string;
  amenities: string[];
  hours: SeedWeekHours;
  /** Exactly one branch per gym may carry this — see {@link ensureBranches}. */
  isDefault: boolean;
};

/**
 * `downtown`'s two branches. Deliberately *not* the two rooms ("Main Floor",
 * "Studio A") this seed used to ship: branches are separate operating units, and
 * the console's location filter is only exercised by data that is genuinely split
 * between two of them. Every profile field the admin roster renders is populated,
 * so the location cards stop falling back to empty placeholders.
 *
 * The two weeks differ on purpose — Rustaveli runs to midnight and opens on
 * Sunday, Saburtalo shuts at 22:00 and closes on Sunday — so "open now" and
 * today's-hours logic have two genuinely different answers to give.
 */
const DOWNTOWN_BRANCHES: readonly SeedBranch[] = [
  {
    name: 'Rustaveli Flagship',
    legacyName: 'Main Floor',
    address: '12 Rustaveli Ave, Tbilisi 0108',
    phone: '+995 322 55 10 20',
    amenities: ['Free weights', 'Olympic platform', 'Sauna', 'Parking', 'Café', 'Towel service'],
    hours: week(['06:00', '00:00'], ['08:00', '22:00'], ['09:00', '18:00']),
    isDefault: true,
  },
  {
    name: 'Saburtalo Branch',
    legacyName: 'Studio A',
    address: '48 Kavtaradze St, Tbilisi 0186',
    phone: '+995 322 55 10 21',
    amenities: ['Group studio', 'Spin room', 'Boxing ring', 'Lockers'],
    hours: week(['07:00', '22:00'], ['09:00', '17:00'], null),
    isDefault: false,
  },
];

/**
 * `riverside`'s single branch. The gym gets no demo enrichment, but it still needs
 * a branch: the default-branch migration only backfills databases that already had
 * rows, so without this a fresh `prisma migrate reset` would leave `riverside` with
 * nowhere to attach a class, an order or a lead.
 */
const RIVERSIDE_BRANCHES: readonly SeedBranch[] = [
  {
    name: 'Riverside Quay',
    address: '7 Mtkvari Embankment, Tbilisi 0102',
    phone: '+995 322 44 08 60',
    amenities: ['Pool', 'Cardio deck', 'Lockers', 'Parking'],
    hours: week(['06:30', '21:30'], ['09:00', '16:00'], null),
    isDefault: true,
  },
];

/**
 * Idempotently create/refresh a gym's branches and elect its default, returning the
 * branch ids in spec order (so callers can spread demo rows across them by index).
 *
 * Two invariants this has to hold, both of which the naive "upsert by name" it
 * replaces would break:
 *
 * 1. **Exactly one default per gym.** `locations_gymId_default_key` is a PARTIAL
 *    unique index (`ON "locations"("gymId") WHERE "isDefault"`), so a second
 *    default is a hard database error, not a silently-wrong row. The election
 *    therefore *clears* every other default before setting the chosen one, inside
 *    one transaction — never the other way round, which would collide with the
 *    outgoing default mid-statement.
 * 2. **Re-running never forks the branch list.** A branch is matched by its name
 *    or its `legacyName`, so the rooms an older seed created are renamed and
 *    filled in rather than left behind alongside the new branches.
 */
async function ensureBranches(
  gymId: string,
  branches: readonly SeedBranch[],
): Promise<readonly string[]> {
  const ids: string[] = [];
  for (const branch of branches) {
    // Current name wins; the legacy name is only consulted if no branch answers to
    // the new one, so a database that has already been re-seeded is left alone.
    const existing =
      (await prisma.location.findFirst({
        where: { gymId, name: branch.name },
        select: { id: true },
      })) ??
      (branch.legacyName
        ? await prisma.location.findFirst({
            where: { gymId, name: branch.legacyName },
            select: { id: true },
          })
        : null);
    const profile = {
      name: branch.name,
      address: branch.address,
      phone: branch.phone,
      amenities: branch.amenities,
      hours: branch.hours,
      status: LocationStatus.ACTIVE,
    };
    if (existing) {
      await prisma.location.update({ where: { id: existing.id }, data: profile });
      ids.push(existing.id);
      continue;
    }
    const created = await prisma.location.create({
      data: { gymId, ...profile },
      select: { id: true },
    });
    ids.push(created.id);
  }

  const defaultIndex = branches.findIndex((branch) => branch.isDefault);
  const defaultId = ids[defaultIndex === -1 ? 0 : defaultIndex];
  if (defaultId) {
    await prisma.$transaction([
      prisma.location.updateMany({
        where: { gymId, isDefault: true, id: { not: defaultId } },
        data: { isDefault: false },
      }),
      prisma.location.update({ where: { id: defaultId }, data: { isDefault: true } }),
    ]);
  }
  return ids;
}

/**
 * Idempotently roster one staff member onto a set of branches — the
 * {@link LocationStaff} rows Stage 6 of multi-branch introduced to replace
 * `GymMember.assignedLocationIds`.
 *
 * `branches` indexes the gym's branches in spec order. Additive: it creates the
 * assignments the spec names and never removes one an operator added in the
 * console, matching the stance the whole seed takes (the till never re-prices, the
 * stock upsert never clobbers a count). The `@@unique([staffId, locationId])` the
 * array could never have is what makes `skipDuplicates` enough — a duplicate id in
 * a `String[]` used to be silently legal and doubled the person in anything counted
 * off it.
 *
 * It deliberately does NOT write `assignedLocationIds`. That column is deprecated
 * and still read by `staff.service.ts` until the API half of Stage 6 lands; writing
 * both here would make the seed the first thing in the codebase to assert two
 * possibly-disagreeing answers, which is precisely the drift the join table exists
 * to end. A dev database seeded before Stage 6 keeps whatever the array held — the
 * migration carried every valid entry across.
 */
async function assignBranches(
  gymId: string,
  staffId: string,
  branches: readonly number[],
  locationIds: readonly string[],
): Promise<void> {
  const rows = branches
    .map((index) => locationIds[index])
    .filter((locationId): locationId is string => Boolean(locationId))
    .map((locationId) => ({ gymId, staffId, locationId }));
  if (rows.length === 0) {
    return;
  }
  await prisma.locationStaff.createMany({ data: rows, skipDuplicates: true });
}

/**
 * The demo classes materialised for *today* so the schedule / alerts / bookings
 * light up. `hour` is local-time start; `capacity` is the occurrence capacity;
 * `booked` is how many confirmed bookings to seed (kept under capacity, one row
 * near-full to exercise the "≥90% full" alert); `branch` is an index into
 * {@link DOWNTOWN_BRANCHES}, alternating so each branch owns half the timetable.
 */
const DEMO_TODAY_CLASSES = [
  {
    title: 'Morning Yoga',
    hour: 8,
    capacity: 20,
    booked: 14,
    color: '#10B981',
    trainer: 'Ana G.',
    branch: 0,
  },
  {
    title: 'CrossFit WOD',
    hour: 12,
    capacity: 14,
    booked: 14,
    color: '#EC4899',
    trainer: 'Levan M.',
    branch: 1,
  },
  {
    title: 'Spin Express',
    hour: 18,
    capacity: 24,
    booked: 20,
    color: '#7C3AED',
    trainer: 'Sandro K.',
    branch: 0,
  },
  {
    title: 'Boxing Basics',
    hour: 19,
    capacity: 12,
    booked: 7,
    color: '#F59E0B',
    trainer: 'Nika B.',
    branch: 1,
  },
] as const;

/**
 * Staff login fixtures for the `downtown` pilot gym — one non-MEMBER membership
 * per {@link Role} the console gates on, each backed by a real (verified) user so
 * a pilot operator can sign into the admin console as any role out of the box.
 * They share the dev password (**Test1234!**) via {@link DEV_PASSWORD_HASH}, so
 * these are demo/dev credentials only — never real ones. Upserted by email + the
 * (userId, gymId) membership unique, so re-running the seed never duplicates them.
 */
const DEMO_STAFF = [
  // The manager and the receptionist both cover the two sites, which is not a
  // shortcut: {@link DEMO_TILL_SALES} already has each of them ringing sales at
  // both branches, and a seed that rostered them at one would contradict its own
  // takings. The per-branch difference on the Staff page comes from the coaches
  // instead — see {@link DEMO_TRAINERS} — and from the SHIFTS, where somebody who
  // covers two branches is still at exactly one door on any given day.
  {
    name: 'Mariam Beridze',
    email: 'manager@downtown.demo',
    role: Role.MANAGER,
    base: 0,
    branches: [0, 1],
  },
  {
    name: 'Giorgi Nadiradze',
    email: 'reception@downtown.demo',
    role: Role.RECEPTIONIST,
    base: 0,
    branches: [0, 1],
  },
  { name: 'Coach Nia', email: 'coach@downtown.demo', role: Role.TRAINER, base: 1, branches: [1] },
] as const;

/**
 * The weekly rota — one {@link ShiftSlot} per row, each at exactly ONE branch.
 *
 * This is the fixture that makes Stage 6's central distinction visible in dev.
 * Mariam and Giorgi are rostered at BOTH branches ({@link LocationStaff}), and
 * their shifts still name a single site per day: Giorgi is at the flagship on
 * Monday and at Saburtalo on Tuesday. "Can be rostered here" and "is here on
 * Tuesday morning" are different questions, and only the second one staffs a door.
 *
 * `dayOfWeek` is 0 (Monday) … 6 (Sunday); `branch` indexes
 * {@link DOWNTOWN_BRANCHES}. Every `branch` is one the staff member is rostered at,
 * for the same reason {@link DEMO_TRAINERS}'s `base` is: a shift at a branch its
 * owner does not work at is a contradiction nothing in the schema would catch.
 *
 * `location` (the free text this replaced) is never written. Post-Stage-6 that
 * column means only "a name that resolved to no branch", and a seed inventing one
 * would manufacture the residual class the migration exists to isolate.
 */
const DEMO_SHIFTS: ReadonlyArray<{
  staff: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  branch: number;
}> = [
  // Manager: flagship early in the week, satellite late — one door per day.
  { staff: 'manager@downtown.demo', dayOfWeek: 0, startTime: '08:00', endTime: '16:00', branch: 0 },
  { staff: 'manager@downtown.demo', dayOfWeek: 1, startTime: '08:00', endTime: '16:00', branch: 0 },
  { staff: 'manager@downtown.demo', dayOfWeek: 3, startTime: '10:00', endTime: '18:00', branch: 1 },
  { staff: 'manager@downtown.demo', dayOfWeek: 4, startTime: '10:00', endTime: '18:00', branch: 1 },
  // Reception: alternates, so "who is working now" differs by branch AND by day.
  {
    staff: 'reception@downtown.demo',
    dayOfWeek: 0,
    startTime: '06:00',
    endTime: '14:00',
    branch: 0,
  },
  {
    staff: 'reception@downtown.demo',
    dayOfWeek: 1,
    startTime: '07:00',
    endTime: '15:00',
    branch: 1,
  },
  {
    staff: 'reception@downtown.demo',
    dayOfWeek: 2,
    startTime: '06:00',
    endTime: '14:00',
    branch: 0,
  },
  {
    staff: 'reception@downtown.demo',
    dayOfWeek: 3,
    startTime: '07:00',
    endTime: '15:00',
    branch: 1,
  },
  {
    staff: 'reception@downtown.demo',
    dayOfWeek: 4,
    startTime: '06:00',
    endTime: '14:00',
    branch: 0,
  },
  {
    staff: 'reception@downtown.demo',
    dayOfWeek: 5,
    startTime: '09:00',
    endTime: '17:00',
    branch: 0,
  },
  // Coach Nia is rostered at the satellite only, so every shift is there.
  { staff: 'coach@downtown.demo', dayOfWeek: 1, startTime: '12:00', endTime: '20:00', branch: 1 },
  { staff: 'coach@downtown.demo', dayOfWeek: 3, startTime: '12:00', endTime: '20:00', branch: 1 },
  { staff: 'coach@downtown.demo', dayOfWeek: 5, startTime: '10:00', endTime: '16:00', branch: 1 },
];

/**
 * The bookable services catalogue, and the seed's demonstration that a `Service`
 * needs NO branch of its own.
 *
 * `trainer` names a {@link DEMO_TRAINERS} coach — the staff member who delivers it.
 * Where the service can be booked is DERIVED from that person's
 * {@link LocationStaff} rows and stored nowhere, which is the whole argument in the
 * `Service` model doc: a coach who covers both sites offers their service at both,
 * and a column here would be a second copy of the roster that an operator has to
 * remember to update twice.
 *
 * Chosen so the derivation produces three visibly different answers: Ana works at
 * the flagship only, Nia at the satellite only, and Sandro at both — so the
 * services list narrows to two entries under either branch and shows all three
 * under "All locations". The seed prints exactly that as
 * `downtownServicesByBranch`, because a derivation with no dev coverage is a
 * derivation nobody notices breaking.
 */
const DEMO_SERVICES: ReadonlyArray<{
  name: string;
  trainer: string;
  priceMinor: number;
  durationMinutes: number;
  description: string;
}> = [
  {
    name: '1:1 Strength Coaching',
    trainer: 'Ana G.',
    priceMinor: 12000,
    durationMinutes: 60,
    description: 'One hour of programmed lifting with a coach.',
  },
  {
    name: 'Boxing Technique Session',
    trainer: 'Coach Nia',
    priceMinor: 9000,
    durationMinutes: 45,
    description: 'Pads, footwork and combinations, one-to-one.',
  },
  {
    name: 'Mobility Assessment',
    trainer: 'Sandro K.',
    priceMinor: 6000,
    durationMinutes: 30,
    description: 'A movement screen and a corrective plan.',
  },
];

/**
 * One purchasable variant of a demo {@link DEMO_PRODUCTS} product.
 *
 * `stockByBranch` is the on-hand count PER BRANCH, in {@link DOWNTOWN_BRANCHES}
 * order — since Stage 4 of multi-branch each branch holds its own stock, and a
 * single number would be a figure no shelf actually has. The gym-wide roll-up
 * stored in `Product.variants[i].stock` is their sum, computed at seed time.
 * `priceAmount` null inherits the product's base price; name, SKU and price stay
 * catalogue-level, identical at every branch.
 */
type DemoVariant = {
  name: string;
  sku: string;
  stockByBranch: readonly number[];
  priceAmount?: number;
};

/**
 * The retail shop catalogue for the `downtown` pilot gym so the storefront (member
 * shop + admin catalog + POS) renders against real data instead of an empty store.
 * Prices are in GEL minor units (tetri). A mix of variant-bearing and sold-as-is
 * products, one deliberately low on stock and one `INACTIVE`, exercises the roster
 * badges, the low-stock report, and the active/inactive filter. Galleries are left
 * empty so cards render the designed placeholder rather than broken image links.
 * Upserted by (gymId, name) — re-running never duplicates or re-prices a product.
 *
 * ## The per-branch splits are chosen, not scattered
 *
 * Every count differs between Rustaveli (the flagship) and Saburtalo (the smaller
 * studio), because a branch filter that shows the same numbers on both branches
 * demonstrates nothing. Four shapes are deliberately represented, so each of the
 * console's per-branch behaviours has a case in dev:
 *
 * - **Healthy at both** — the tee's S and M, the chocolate whey. The ordinary case.
 * - **Stocked at one, empty at the other** — the tee's L (8 / 0) and the towel
 *   (4 / 0). Selecting Saburtalo must show these as out of stock while the gym-wide
 *   view still reports units on hand.
 * - **The inversion** — vanilla whey is 0 at the flagship and 2 at Saburtalo, the
 *   mirror of every other line. This is the case that catches code which filters
 *   the list by branch but computes the badge from the gym-wide roll-up: get that
 *   wrong and vanilla whey reads "in stock" on the branch that has none.
 * - **Low at both, for different reasons** — XL tee (1 / 2).
 *
 * The gym-wide totals are unchanged from before the split (12/20/8/3, 15/2, 4, 0),
 * so nothing that reads `Product.stock` or `Product.variants[].stock` sees the
 * numbers move; only their distribution is new.
 *
 * `stockByBranch` on the product itself is the BASE position — the product sold
 * as-is, with no variant. Omitting it means the gym does not count this line at
 * all (`Product.stock` stays null and no `ProductStock` row is written), which is
 * what "Resistance Bands Set" exercises. It is the untracked path, and it has to
 * stay represented: a seed where every product is counted would never catch code
 * that treats a missing count as a zero.
 */
const DEMO_PRODUCTS: ReadonlyArray<{
  name: string;
  description: string;
  priceAmount: number;
  status: ProductStatus;
  /** Base-position stock per branch, in {@link DOWNTOWN_BRANCHES} order. Omitted = untracked. */
  stockByBranch?: readonly number[];
  variants: DemoVariant[];
}> = [
  {
    name: 'Branded Training Tee',
    description: 'Breathable performance tee with the club logo.',
    priceAmount: 4500,
    status: ProductStatus.ACTIVE,
    variants: [
      { name: 'S', sku: 'TEE-S', stockByBranch: [9, 3] },
      { name: 'M', sku: 'TEE-M', stockByBranch: [14, 6] },
      // Saburtalo has sold out of L entirely — gym-wide it still reads 8.
      { name: 'L', sku: 'TEE-L', stockByBranch: [8, 0] },
      { name: 'XL', sku: 'TEE-XL', stockByBranch: [1, 2] },
    ],
  },
  {
    name: 'Whey Protein 1kg',
    description: 'Post-workout whey isolate — 25g protein per serving.',
    priceAmount: 8900,
    status: ProductStatus.ACTIVE,
    variants: [
      { name: 'Chocolate', sku: 'WHEY-CHOC', stockByBranch: [11, 4] },
      // The inversion: the only line the flagship is out of and the studio is not.
      { name: 'Vanilla', sku: 'WHEY-VAN', stockByBranch: [0, 2], priceAmount: 9500 },
    ],
  },
  {
    name: 'Insulated Shaker Bottle',
    description: '700ml steel shaker that keeps drinks cold for hours.',
    priceAmount: 2500,
    status: ProductStatus.ACTIVE,
    // The one tracked BASE position in the catalogue. Without it nothing in dev
    // exercises `ProductStock.stock` — every other counted line sells by variant.
    stockByBranch: [18, 5],
    variants: [],
  },
  {
    name: 'Resistance Bands Set',
    description: 'Five looped bands from light to heavy, with a carry pouch.',
    priceAmount: 3900,
    status: ProductStatus.ACTIVE,
    // Deliberately untracked: no `stockByBranch`, no variants. `Product.stock`
    // stays null and this product owns no `ProductStock` row at any branch.
    variants: [],
  },
  {
    name: 'Microfibre Gym Towel',
    description: 'Quick-dry towel sized for the bench and the bag.',
    priceAmount: 1800,
    status: ProductStatus.ACTIVE,
    variants: [{ name: 'Standard', sku: 'TWL-STD', stockByBranch: [4, 0] }],
  },
  {
    name: 'Retired Logo Hoodie',
    description: 'Last season’s hoodie — kept for order history, no longer sold.',
    priceAmount: 6500,
    status: ProductStatus.INACTIVE,
    variants: [{ name: 'M', sku: 'HOOD-M', stockByBranch: [0, 0] }],
  },
];

/**
 * The personal-training package catalogue for the `downtown` pilot gym so the PT /
 * class-pass storefront isn't empty at onboarding. Prices in GEL minor units. A
 * finite-`sessionCount` plan doubles as a class-pass / credit-pack entry (T8.5).
 * Upserted by (gymId, name) — re-running never duplicates or re-prices a plan.
 */
const DEMO_PACKAGES = [
  {
    name: 'Intro PT — 3 Sessions',
    description: 'A three-session starter with a coach to learn the ropes.',
    priceAmount: 15000,
    billingInterval: PackageBillingInterval.ONE_TIME,
    sessionCount: 3,
    creditValidityDays: 60,
    popular: false,
    features: ['3 one-on-one sessions', 'Movement assessment', 'Valid for 60 days'],
  },
  {
    name: '10-Session PT Pack',
    description: 'Ten personal-training sessions at the best per-session rate.',
    priceAmount: 45000,
    billingInterval: PackageBillingInterval.ONE_TIME,
    sessionCount: 10,
    creditValidityDays: 120,
    popular: true,
    features: ['10 one-on-one sessions', 'Progress tracking', 'Valid for 120 days'],
  },
  {
    name: 'Monthly Unlimited PT',
    description: 'Unlimited coached sessions, billed monthly.',
    priceAmount: 60000,
    billingInterval: PackageBillingInterval.MONTH,
    sessionCount: null,
    creditValidityDays: null,
    popular: false,
    features: ['Unlimited sessions', 'Priority booking', 'Nutrition check-ins'],
  },
] as const;

/**
 * Idempotently populate the `downtown` gym. Guards every insert by existence /
 * upsert; never deletes. Uses fixed timestamps derived from `new Date()` at seed
 * runtime so "today" is always the real current day.
 *
 * `locationIds` are the gym's branches in {@link DOWNTOWN_BRANCHES} order (created
 * by {@link ensureBranches} before this runs). Everything that carries a branch —
 * members' home branches, class templates, check-ins, till sales, membership
 * orders — is spread across them rather than piled onto the first, so selecting a
 * branch in the console visibly changes what each page shows.
 */
async function enrichDowntown(gymId: string, locationIds: readonly string[]): Promise<void> {
  // ── Subscription plans (upsert by name) ─────────────────────────────────
  const planIdByName = new Map<string, string>();
  for (const spec of DEMO_PLANS) {
    const existing = await prisma.subscriptionPlan.findFirst({
      where: { gymId, name: spec.name },
      select: { id: true },
    });
    if (existing) {
      planIdByName.set(spec.name, existing.id);
      continue;
    }
    const created = await prisma.subscriptionPlan.create({
      data: {
        gymId,
        name: spec.name,
        priceAmount: spec.priceAmount,
        currency: 'GEL',
        interval: spec.interval,
        popular: spec.popular,
      },
      select: { id: true },
    });
    planIdByName.set(spec.name, created.id);
  }

  // ── Trainers (upsert by name) ───────────────────────────────────────────
  // Each coach is also a staff member (staff ⇄ trainer link), exactly as
  // `POST /admin/trainers` creates them: a login-less `User` on the no-login host
  // plus a `TRAINER` membership. Seeding the profile alone would reproduce the
  // very split the link exists to remove — coaches the schedule can use but the
  // Staff roster has never heard of.
  const trainerIdByName = new Map<string, string>();
  // Staff membership ids by display name, so the services + shifts below can find
  // the person who delivers/works them. Coaches land here from this loop, the
  // login fixtures from the DEMO_STAFF loop further down.
  const staffIdByName = new Map<string, string>();
  for (const spec of DEMO_TRAINERS) {
    const name = spec.name;
    const baseLocationId = locationIds[spec.base] ?? locationIds[0] ?? null;
    const existing = await prisma.trainer.findFirst({
      where: { gymId, name },
      select: { id: true, staffId: true },
    });
    if (existing) {
      trainerIdByName.set(name, existing.id);
      if (existing.staffId) {
        staffIdByName.set(name, existing.staffId);
        // Forced on a re-run, like the member upsert: a database seeded before
        // Stage 6 has every coach on the DEFAULT branch (the migration's guess),
        // and would otherwise keep a roster nobody split. Deterministic, so a
        // second run is a no-op write rather than a reshuffle.
        await prisma.gymMember.update({
          where: { id: existing.staffId },
          data: { locationId: baseLocationId },
        });
        await assignBranches(gymId, existing.staffId, spec.branches, locationIds);
      }
      continue;
    }
    const [firstName, ...rest] = name.split(' ');
    const user = await prisma.user.create({
      data: { name, email: `staff-${randomUUID()}@no-login.fit.local` },
      select: { id: true },
    });
    const staff = await prisma.gymMember.create({
      data: {
        gymId,
        userId: user.id,
        role: Role.TRAINER,
        status: GymMemberStatus.ACTIVE,
        firstName: firstName ?? name,
        lastName: rest.length > 0 ? rest.join(' ') : null,
        // The coach's BASE branch — the single one they are on the books at, and
        // the column a per-branch head-count partitions on. Where they can be
        // ROSTERED is the many-valued `LocationStaff` set written just below, and
        // the two are not the same fact.
        locationId: baseLocationId,
      },
      select: { id: true },
    });
    staffIdByName.set(name, staff.id);
    await assignBranches(gymId, staff.id, spec.branches, locationIds);
    const created = await prisma.trainer.create({
      data: {
        gymId,
        name,
        headline: `${name} · Coach`,
        status: TrainerStatus.ACTIVE,
        staffId: staff.id,
      },
      select: { id: true },
    });
    trainerIdByName.set(name, created.id);
  }

  // ── Members + their subscriptions + a couple of captured payments ───────
  const now = new Date();
  const memberIds: string[] = [];
  for (let i = 0; i < DEMO_MEMBERS.length; i++) {
    const spec = DEMO_MEMBERS[i]!;
    const email = `${spec.name.toLowerCase().replace(/[^a-z]+/g, '.')}@downtown.demo`;

    const user = await prisma.user.upsert({
      where: { email },
      update: { name: spec.name },
      create: { name: spec.name, email, emailVerifiedAt: new Date() },
      select: { id: true },
    });

    // Spread joinedAt across the last ~30 days; a few land inside the last 7 so
    // the "new members · 7d" KPI is populated.
    const joinedAt = daysAgo(i < 4 ? i + 1 : (i % 25) + 5);

    // The member's HOME branch — where they signed up and normally train. Members
    // alternate between the gym's two branches, so `/members` and every per-branch
    // member KPI show a genuine split instead of one branch's roster and an empty
    // one. This is `GymMember.locationId`, not `assignedLocationIds`: the latter is
    // the staff work-assignment array and stays empty for a plain member.
    //
    // Set on `update` as well as `create`, unlike the rest of this upsert. A
    // database seeded before the column existed has every member backfilled onto
    // the default branch by the migration, and would otherwise stay 14-0 forever.
    // Deterministic in `i`, so re-running is a no-op write, not a reshuffle.
    const homeLocationId = locationIds[i % locationIds.length] ?? null;

    const membership = await prisma.gymMember.upsert({
      where: { userId_gymId: { userId: user.id, gymId } },
      update: { locationId: homeLocationId },
      create: {
        userId: user.id,
        gymId,
        role: Role.MEMBER,
        status: GymMemberStatus.ACTIVE,
        joinedAt,
        locationId: homeLocationId,
      },
      select: { id: true },
    });
    memberIds.push(membership.id);

    // One live subscription per member, on their plan. Guard by an existing live
    // subscription (the partial unique already enforces one live sub per member).
    const planId = planIdByName.get(spec.plan) ?? null;
    const planPrice = DEMO_PLANS.find((p) => p.name === spec.plan)?.priceAmount ?? 0;
    const liveSub = await prisma.subscription.findFirst({
      where: {
        gymId,
        memberId: membership.id,
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.FROZEN],
        },
      },
      select: { id: true },
    });
    if (!liveSub) {
      const periodStart = joinedAt;
      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + 30);
      await prisma.subscription.create({
        data: {
          gymId,
          planId,
          memberId: membership.id,
          status: SubscriptionStatus.ACTIVE,
          priceAmount: planPrice,
          currency: 'GEL',
          interval: SubscriptionInterval.MONTH,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      });
    }

    // A couple of captured payments per paying member, spread across ~30 days.
    // A Payment needs a one-to-one Order, so we mint a paid Order alongside it.
    // The order is attributed to the member's home branch (set above), so
    // per-branch revenue splits the same way the roster does rather than piling
    // every taking onto one branch.
    if (planPrice > 0) {
      for (let k = 0; k < 2; k++) {
        // Recent one for a couple of members lands today so "today's revenue" pops.
        const paidAt = k === 0 && i < 3 ? todayAt(9 + i, 15) : daysAgo(3 + i + k * 11);
        await ensurePayment(gymId, membership.id, planPrice, paidAt, spec.name, homeLocationId);
      }
    }
  }

  // ── Today's classes (templates → today's instance) + bookings ───────────
  for (const cls of DEMO_TODAY_CLASSES) {
    const trainerId = trainerIdByName.get(cls.trainer) ?? null;
    // Each demo class runs at the branch its spec names, so filtering the schedule
    // to one branch halves the timetable instead of leaving it unchanged.
    const locationId = locationIds[cls.branch] ?? locationIds[0] ?? null;

    let template = await prisma.classTemplate.findFirst({
      where: { gymId, title: cls.title },
      select: { id: true },
    });
    if (template) {
      // Re-point a template an older seed pinned to the wrong branch (they all
      // used to land on the first one). Idempotent: a second run is a no-op write.
      await prisma.classTemplate.update({ where: { id: template.id }, data: { locationId } });
    }
    if (!template) {
      template = await prisma.classTemplate.create({
        data: {
          gymId,
          title: cls.title,
          category: 'Group',
          trainerId,
          locationId,
          capacity: cls.capacity,
          durationMinutes: 60,
          rrule: 'FREQ=DAILY',
          color: cls.color,
          // Anchor at the class hour (UTC) so the T5.3 generator fills the 4-week
          // horizon with daily occurrences at that hour, not at seed-run time.
          validFrom: pastUtcAnchorAtHour(cls.hour),
        },
        select: { id: true },
      });
    }

    const startsAt = todayAt(cls.hour);
    const endsAt = new Date(startsAt);
    endsAt.setHours(endsAt.getHours() + 1);

    let instance = await prisma.classInstance.findFirst({
      where: { gymId, templateId: template.id, startsAt },
      select: { id: true },
    });
    if (!instance) {
      instance = await prisma.classInstance.create({
        data: {
          gymId,
          templateId: template.id,
          startsAt,
          endsAt,
          locationId,
          capacityOverride: cls.capacity,
          status: InstanceStatus.SCHEDULED,
        },
        select: { id: true },
      });
    }

    // Seed confirmed bookings up to `cls.booked`, guarded by a per-(member,
    // instance) idempotency key so re-running never double-books.
    const target = Math.min(cls.booked, memberIds.length);
    for (let m = 0; m < target; m++) {
      const memberId = memberIds[m]!;
      const idempotencyKey = `seed:${instance.id}:${memberId}`;
      const existing = await prisma.booking.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });
      if (!existing) {
        await prisma.booking.create({
          data: {
            gymId,
            classInstanceId: instance.id,
            memberId,
            status: BookingStatus.BOOKED,
            idempotencyKey,
          },
        });
      }
    }
    // Keep the denormalised counter in step with what we seeded.
    await prisma.classInstance.update({
      where: { id: instance.id },
      data: { bookedCount: target },
    });
  }

  // ── Today's check-ins (varied members, round-robin across the branches) ──
  const existingCheckIns = await prisma.checkIn.count({
    where: { gymId, checkedInAt: { gte: startOfToday() } },
  });
  if (existingCheckIns === 0) {
    const feed = memberIds.slice(0, 9);
    await prisma.checkIn.createMany({
      data: feed.map((memberId, idx) => ({
        gymId,
        gymMemberId: memberId,
        method: idx % 3 === 0 ? CheckInMethod.QR : CheckInMethod.MANUAL,
        checkedInAt: todayAt(7 + idx, (idx * 13) % 60),
        locationId: locationIds[idx % locationIds.length] ?? null,
      })),
    });
  }

  // ── Staff (login fixtures, one per non-MEMBER role) ─────────────────────
  // The staff membership ids are kept because the till sales below are attributed
  // to them — `Order.soldById` is a `GymMember`, not a `User`.
  const staffIdByEmail = new Map<string, string>();
  for (const staff of DEMO_STAFF) {
    // The BASE branch — the one this employee is on the books at, which is what a
    // per-branch head-count partitions on. Every branch they can be rostered at is
    // `staff.branches`, written to `LocationStaff` below; a manager who covers both
    // sites is still based at one.
    const homeLocationId = locationIds[staff.base] ?? locationIds[0] ?? null;
    const user = await prisma.user.upsert({
      where: { email: staff.email },
      update: { name: staff.name, passwordHash: DEV_PASSWORD_HASH, emailVerifiedAt: new Date() },
      create: {
        name: staff.name,
        email: staff.email,
        passwordHash: DEV_PASSWORD_HASH,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    const membership = await prisma.gymMember.upsert({
      where: { userId_gymId: { userId: user.id, gymId } },
      update: { role: staff.role, status: GymMemberStatus.ACTIVE, locationId: homeLocationId },
      create: {
        userId: user.id,
        gymId,
        role: staff.role,
        status: GymMemberStatus.ACTIVE,
        locationId: homeLocationId,
      },
      select: { id: true },
    });
    staffIdByEmail.set(staff.email, membership.id);
    staffIdByName.set(staff.name, membership.id);
    await assignBranches(gymId, membership.id, staff.branches, locationIds);

    // A staff member with the TRAINER role gets the coach profile the API would
    // have created with them, so the demo gym's schedule can actually be assigned
    // to the coach the roster lists.
    if (staff.role === Role.TRAINER) {
      const profile = await prisma.trainer.findFirst({
        where: { staffId: membership.id },
        select: { id: true },
      });
      if (!profile) {
        await prisma.trainer.create({
          data: {
            gymId,
            name: staff.name,
            headline: `${staff.name} · Coach`,
            status: TrainerStatus.ACTIVE,
            staffId: membership.id,
          },
          select: { id: true },
        });
      }
    }
  }

  // ── Retail shop catalogue + its per-branch stock (upsert by name) ───────
  //
  // Two writes, in this order and never one without the other:
  //
  //   1. the product — the catalogue record, gym-wide, created once;
  //   2. one `ProductStock` row per branch that holds any of it — the
  //      AUTHORITATIVE on-hand counts since Stage 4 of multi-branch.
  //
  // `Product.stock` and `Product.variants[].stock` are then RECOMPUTED from the
  // branch rows actually in the database, rather than written from the spec. That
  // is deliberate and worth the extra query: since Stage 4 the gym-wide figures are
  // a derived roll-up, and a seed that wrote them independently would be the first
  // thing in the codebase to let the two disagree. Recomputing means every seeded
  // database starts with the invariant provably true — and a run against a database
  // seeded before this code existed repairs the roll-up instead of leaving it stale.
  //
  // (Absolute writes here would fail `pnpm check:atomic-counters` anywhere else;
  // seeds are exempt because they fill an empty database with no concurrent writer
  // to race. See docs/adr/atomic-counters.md.)
  for (const spec of DEMO_PRODUCTS) {
    const product =
      (await prisma.product.findFirst({
        where: { gymId, name: spec.name },
        select: { id: true },
      })) ??
      (await prisma.product.create({
        data: {
          gymId,
          name: spec.name,
          description: spec.description,
          priceAmount: spec.priceAmount,
          currency: 'GEL',
          status: spec.status,
          // Catalogue shape only. The counts land on the branch rows below and are
          // rolled back up afterwards, so this starts at zero rather than lying.
          variants: spec.variants.map((v) => ({
            name: v.name,
            sku: v.sku,
            priceAmount: v.priceAmount ?? null,
            stock: 0,
          })),
        },
        select: { id: true },
      }));

    // Per-branch rows. A branch that holds nothing of a line still gets a row here
    // (a zero the demo genuinely asserts), unlike the Stage 4 migration, which
    // writes no row where nothing was counted. The two are the same to every read;
    // the difference is that a seed KNOWS the answer is zero and a migration does not.
    for (let b = 0; b < locationIds.length; b++) {
      const locationId = locationIds[b]!;
      const base = spec.stockByBranch?.[b];
      const variantCounts = spec.variants.map((v) => v.stockByBranch[b] ?? 0);
      // An untracked line — no base figure and no variants — owns no row anywhere.
      if (base === undefined && variantCounts.length === 0) {
        continue;
      }
      await prisma.productStock.upsert({
        where: { productId_locationId: { productId: product.id, locationId } },
        // Never clobber a count someone changed in the console, the same stance the
        // product itself takes by not re-pricing on a re-run.
        update: {},
        create: {
          gymId,
          productId: product.id,
          locationId,
          stock: base ?? null,
          variants: variantCounts,
        },
        select: { id: true },
      });
    }

    // Roll the branch rows back up to the gym-wide figures on the product.
    const branchRows = await prisma.productStock.findMany({
      where: { productId: product.id },
      select: { stock: true, variants: true },
    });
    const variantTotals = spec.variants.map((_, index) =>
      branchRows.reduce((sum, row) => {
        const counts = Array.isArray(row.variants) ? (row.variants as number[]) : [];
        return sum + (typeof counts[index] === 'number' ? counts[index] : 0);
      }, 0),
    );
    // Base XOR variants, exactly as `Product.stock` documents: a product that sells
    // by variant keeps its base count null and the two are never summed. `null` also
    // survives a product no branch tracks — a SUM over zero rows is not a zero.
    const tracked = branchRows.filter((row) => row.stock !== null);
    const baseTotal =
      spec.variants.length > 0 || tracked.length === 0
        ? null
        : tracked.reduce((sum, row) => sum + (row.stock ?? 0), 0);

    await prisma.product.update({
      where: { id: product.id },
      data: {
        stock: baseTotal,
        variants: spec.variants.map((v, index) => ({
          name: v.name,
          sku: v.sku,
          priceAmount: v.priceAmount ?? null,
          stock: variantTotals[index] ?? 0,
        })),
      },
    });
  }

  // ── Personal-training package catalogue (upsert by name) ────────────────
  for (const spec of DEMO_PACKAGES) {
    const existing = await prisma.packagePlan.findFirst({
      where: { gymId, name: spec.name },
      select: { id: true },
    });
    if (existing) {
      continue;
    }
    await prisma.packagePlan.create({
      data: {
        gymId,
        name: spec.name,
        description: spec.description,
        priceAmount: spec.priceAmount,
        currency: 'GEL',
        billingInterval: spec.billingInterval,
        sessionCount: spec.sessionCount,
        creditValidityDays: spec.creditValidityDays,
        features: [...spec.features],
        popular: spec.popular,
        status: PackagePlanStatus.ACTIVE,
      },
    });
  }

  // ── The weekly rota, one branch per shift ───────────────────────────────
  //
  // Guarded on (staffId, dayOfWeek, startTime) — a `ShiftSlot` has no natural
  // unique column, and that triple is what the staff console's weekly grid treats
  // as one cell. `locationId` is forced on the guarded path as well, so a database
  // seeded before Stage 6 (whose shifts carry a free-text name, or nothing) picks
  // up a real branch instead of staying unresolved forever.
  for (const shift of DEMO_SHIFTS) {
    const staffId = staffIdByEmail.get(shift.staff);
    const locationId = locationIds[shift.branch] ?? locationIds[0] ?? null;
    if (!staffId) {
      continue;
    }
    const existing = await prisma.shiftSlot.findFirst({
      where: { gymId, staffId, dayOfWeek: shift.dayOfWeek, startTime: shift.startTime },
      select: { id: true },
    });
    if (existing) {
      await prisma.shiftSlot.update({
        where: { id: existing.id },
        // `locationName` is cleared, not preserved: post-Stage-6 that column means
        // "a typed name that resolved to no branch", and a row that now has a real
        // branch must not also carry a stale label.
        data: { locationId, locationName: null },
      });
      continue;
    }
    await prisma.shiftSlot.create({
      data: {
        gymId,
        staffId,
        dayOfWeek: shift.dayOfWeek,
        startTime: shift.startTime,
        endTime: shift.endTime,
        locationId,
      },
    });
  }

  // ── Services + a few sessions on the PT calendar ────────────────────────
  //
  // The service itself carries NO branch — see the `Service` model doc. Where it
  // can be booked is derived from its staff member's `LocationStaff` rows, so the
  // only thing the seed has to get right is which coach delivers it.
  //
  // Its SESSIONS do carry one: a booked slot happens at exactly one place, and it
  // is frozen there. Each is placed at a branch its staff member is rostered at.
  for (let i = 0; i < DEMO_SERVICES.length; i++) {
    const spec = DEMO_SERVICES[i]!;
    const staffId = staffIdByName.get(spec.trainer);
    if (!staffId) {
      continue;
    }
    const service =
      (await prisma.service.findFirst({
        where: { gymId, name: spec.name },
        select: { id: true, staffId: true },
      })) ??
      (await prisma.service.create({
        data: {
          gymId,
          type: ServiceType.PERSONAL_TRAINING,
          name: spec.name,
          staffId,
          priceMinor: spec.priceMinor,
          currency: 'GEL',
          durationMinutes: spec.durationMinutes,
          description: spec.description,
          status: ServiceStatus.ACTIVE,
        },
        select: { id: true, staffId: true },
      }));

    // Two open slots each, on the two days after today, at the branches this
    // service's coach is rostered at — so the PT calendar narrows under a branch
    // filter instead of showing the same list twice.
    const branchIds = await prisma.locationStaff.findMany({
      where: { gymId, staffId: service.staffId },
      select: { locationId: true },
      orderBy: { locationId: 'asc' },
    });
    for (let k = 0; k < 2; k++) {
      const locationId = branchIds[k % Math.max(branchIds.length, 1)]?.locationId ?? null;
      const startsAt = new Date();
      startsAt.setUTCDate(startsAt.getUTCDate() + k + 1);
      startsAt.setUTCHours(10 + i * 2 + k, 0, 0, 0);
      const existing = await prisma.serviceSession.findFirst({
        where: { gymId, serviceId: service.id, startsAt },
        select: { id: true, locationId: true },
      });
      if (existing) {
        if (!existing.locationId) {
          await prisma.serviceSession.update({ where: { id: existing.id }, data: { locationId } });
        }
        continue;
      }
      await prisma.serviceSession.create({
        data: {
          gymId,
          serviceId: service.id,
          staffId: service.staffId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + spec.durationMinutes * 60 * 1000),
          status: ServiceSessionStatus.OPEN,
          locationId,
        },
      });
    }
  }

  // ── Till sales (POS), attributed to the staff who rang them ─────────────
  await ensureTillSales(gymId, staffIdByEmail, locationIds);

  // ── Invoices, attributed through the member ─────────────────────────────
  // Last, because every invoice is raised against a member (and most against
  // their live subscription), so both have to exist first.
  await ensureInvoices(gymId, memberIds);
}

/* -------------------------------------------------------------------------- */
/*  Till sales                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Retail sales rung up at the desk, spread over the last three weeks.
 *
 * These exist so the sales-by-staff, payment-method, POS-transaction-log and
 * refunds-detail reports have something real to aggregate. The membership
 * payments seeded elsewhere cannot stand in for them: those are the self-serve
 * purchase wizard's (`provider: 'stub'`, no seller), and attributing them to a
 * staff member would credit somebody with a sale nobody rang.
 *
 * `soldBy` names a {@link DEMO_STAFF} email; only the manager and the
 * receptionist work the till, so the trainer never appears as a seller. Prices
 * mirror {@link DEMO_PRODUCTS} so a line total reconciles against the catalogue.
 * `branch` indexes {@link DOWNTOWN_BRANCHES} — a sale is rung on one branch's till,
 * and the takings are split between the two so cash reconciliation and the sales
 * reports differ per branch instead of one branch owning every transaction.
 */
const DEMO_TILL_SALES: ReadonlyArray<{
  daysAgo: number;
  hour: number;
  branch: number;
  soldBy: string;
  method: PaymentMethod;
  lines: Array<{ label: string; unitPrice: number; qty: number }>;
  /** Set when the sale was later refunded, with the operator's note. */
  refund?: { reason: string; processedBy: string; daysAgo: number };
}> = [
  {
    daysAgo: 0,
    hour: 9,
    branch: 0,
    soldBy: 'reception@downtown.demo',
    method: PaymentMethod.CASH,
    lines: [{ label: 'Insulated Shaker Bottle', unitPrice: 2500, qty: 1 }],
  },
  {
    daysAgo: 0,
    hour: 14,
    branch: 1,
    soldBy: 'manager@downtown.demo',
    method: PaymentMethod.CARD,
    lines: [
      { label: 'Whey Protein 1kg', unitPrice: 8900, qty: 1 },
      { label: 'Microfibre Gym Towel', unitPrice: 1800, qty: 2 },
    ],
  },
  {
    daysAgo: 2,
    hour: 18,
    branch: 1,
    soldBy: 'reception@downtown.demo',
    method: PaymentMethod.CARD,
    lines: [{ label: 'Branded Training Tee', unitPrice: 4500, qty: 2 }],
    // A partial return: the customer kept one tee. Partial refunds are exactly the
    // case the order-level status event could never attribute, so the seed carries
    // one to prove the refunds-detail report reads its operator.
    refund: {
      reason: 'Wrong size, one returned',
      processedBy: 'manager@downtown.demo',
      daysAgo: 1,
    },
  },
  {
    daysAgo: 5,
    hour: 11,
    branch: 0,
    soldBy: 'manager@downtown.demo',
    method: PaymentMethod.MEMBER_ACCOUNT,
    lines: [{ label: 'Resistance Bands Set', unitPrice: 3900, qty: 1 }],
  },
  {
    daysAgo: 9,
    hour: 16,
    branch: 1,
    soldBy: 'reception@downtown.demo',
    method: PaymentMethod.CASH,
    lines: [
      { label: 'Microfibre Gym Towel', unitPrice: 1800, qty: 1 },
      { label: 'Insulated Shaker Bottle', unitPrice: 2500, qty: 1 },
    ],
  },
  {
    daysAgo: 16,
    hour: 12,
    branch: 0,
    soldBy: 'manager@downtown.demo',
    method: PaymentMethod.CARD,
    lines: [{ label: 'Whey Protein 1kg', unitPrice: 8900, qty: 2 }],
  },
  {
    daysAgo: 20,
    hour: 8,
    branch: 0,
    soldBy: 'reception@downtown.demo',
    method: PaymentMethod.CASH,
    lines: [{ label: 'Branded Training Tee', unitPrice: 4500, qty: 1 }],
  },
];

/**
 * Idempotently write {@link DEMO_TILL_SALES} as `pos`-provider orders, each with
 * its priced lines, its captured payment, and its opening status event — the same
 * shape `OrdersService.recordSale` writes, so the reports read seeded and
 * real-world sales through one code path.
 *
 * Guarded per sale on an existing `pos` payment at the same instant, so re-running
 * the seed never stacks duplicate takings (mirroring `ensurePayment`).
 *
 * `locationIds` are the gym's branches in {@link DOWNTOWN_BRANCHES} order; each
 * sale's `branch` picks the till it was rung on.
 */
async function ensureTillSales(
  gymId: string,
  staffIdByEmail: ReadonlyMap<string, string>,
  locationIds: readonly string[],
): Promise<void> {
  for (const sale of DEMO_TILL_SALES) {
    const soldAt = daysAgo(sale.daysAgo);
    soldAt.setHours(sale.hour, 0, 0, 0);

    const existing = await prisma.payment.findFirst({
      where: { gymId, provider: 'pos', createdAt: soldAt },
      select: { id: true },
    });
    if (existing) {
      continue;
    }

    const soldById = staffIdByEmail.get(sale.soldBy) ?? null;
    const total = sale.lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);

    // The till this sale was rung on. Stamped on the order AND, since Stage 5, on
    // the payment and any refund — the same branch on all three, because they are
    // one event: `Payment.locationId` / `Refund.locationId` are denormalised
    // copies of `order.locationId`, not independent facts. A seed that let them
    // drift would manufacture the exact inconsistency the denormalisation exists
    // to avoid, and every per-branch revenue figure would depend on which table
    // the reader happened to reach for.
    const branchId = locationIds[sale.branch] ?? locationIds[0] ?? null;

    const order = await prisma.order.create({
      data: {
        gymId,
        soldById,
        locationId: branchId,
        total,
        currency: 'GEL',
        status: OrderStatus.PAID,
        createdAt: soldAt,
        updatedAt: soldAt,
        items: {
          create: sale.lines.map((line) => ({
            // The POS folds the quantity into the label only when more than one
            // was sold, and records the raw `qty` regardless.
            label: line.qty > 1 ? `${line.label} ×${line.qty}` : line.label,
            amount: line.unitPrice * line.qty,
            qty: line.qty,
          })),
        },
        statusEvents: { create: { status: OrderStatus.PAID, at: soldAt } },
      },
      select: { id: true },
    });

    const payment = await prisma.payment.create({
      data: {
        gymId,
        orderId: order.id,
        locationId: branchId,
        amount: total,
        currency: 'GEL',
        status: PaymentStatus.CAPTURED,
        method: sale.method,
        provider: 'pos',
        createdAt: soldAt,
        updatedAt: soldAt,
      },
      select: { id: true },
    });

    if (!sale.refund) {
      continue;
    }
    // One line's worth came back, leaving the payment partially refunded and the
    // order still PAID — which is why no status event is written here either.
    const refundedAt = daysAgo(sale.refund.daysAgo);
    refundedAt.setHours(sale.hour, 30, 0, 0);
    const refundAmount = sale.lines[0]!.unitPrice;
    await prisma.refund.create({
      data: {
        gymId,
        orderId: order.id,
        paymentId: payment.id,
        // The SELLING branch, not wherever a return would be keyed — netting
        // takings against reversals only works if both land in the same bucket.
        locationId: branchId,
        amount: refundAmount,
        reason: sale.refund.reason,
        restockItems: true,
        processedById: staffIdByEmail.get(sale.refund.processedBy) ?? null,
        createdAt: refundedAt,
      },
    });
    await prisma.payment.update({
      where: { id: payment.id },
      data: { refundedAmount: refundAmount },
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  Invoices                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One demo invoice, as a spec the seed resolves against the members it just wrote.
 *
 * `member` indexes {@link DEMO_MEMBERS} — and it is the ONLY thing that decides the
 * invoice's branch. Deliberately: `Invoice.locationId` is the billed member's home
 * branch at issue time, the PERSON half of the attribution rule in
 * `apps/api/src/common/location-filter.util.ts`, and the seed applies that rule
 * rather than naming a branch of its own. Members alternate between the two
 * downtown branches by index, so an even `member` lands the invoice at Rustaveli
 * and an odd one at Saburtalo. The counts are deliberately lopsided (9 / 5) so
 * choosing a branch in the console visibly changes the roster instead of halving a
 * tie nobody would notice.
 *
 * `member: null` is the unattributable row — see {@link ensureInvoices}.
 *
 * `daysAgo` is when the charge was raised; `dueInDays` is set only on a `PENDING`
 * row, because `Invoice.dueDate` documents itself as meaningful only there (a
 * settled charge has nothing left to fall due). `fromSubscription` links the row to
 * the member's live subscription, which is what makes it show up in the member
 * portal's billing history as well as on the admin board.
 *
 * No spec names an `orderId`. That is the shape of the real majority: recurring
 * billing raises an invoice with no order at all, which is precisely why the branch
 * comes from the member and never from `Invoice.orderId`.
 */
interface SeedInvoice {
  member: number | null;
  type: InvoiceType;
  status: InvoiceStatus;
  /** In the currency's MINOR units (tetri), as everywhere else. */
  amount: number;
  description: string;
  daysAgo: number;
  dueInDays?: number;
  fromSubscription?: boolean;
}

/**
 * The demo invoice board.
 *
 * Spread across all four {@link InvoiceStatus} values and all six
 * {@link InvoiceType} values, because `/payments/invoices` filters on type and
 * badges the status, and a board where every row says `PAID · MEMBERSHIP` exercises
 * neither. Prices echo {@link DEMO_PLANS} and {@link DEMO_SERVICES} so a membership
 * charge reconciles against the plan it renewed.
 *
 * The membership wordings come from {@link subscriptionInvoiceDescription} — the
 * same helper the API's enrolment and renewal mint sites use — so the seeded board
 * reads exactly like a real one rather than approximating it.
 */
const DEMO_INVOICES: readonly SeedInvoice[] = [
  // ── Rustaveli Flagship (even member indices) — 9 rows ──────────────────
  {
    member: 0,
    type: InvoiceType.MEMBERSHIP,
    status: InvoiceStatus.PAID,
    amount: 12000,
    description: subscriptionInvoiceDescription('Premium', 'MONTH', 'enrolment'),
    daysAgo: 34,
    fromSubscription: true,
  },
  {
    member: 0,
    type: InvoiceType.MEMBERSHIP,
    status: InvoiceStatus.PAID,
    amount: 12000,
    description: subscriptionInvoiceDescription('Premium', 'MONTH', 'renewal'),
    daysAgo: 4,
    fromSubscription: true,
  },
  {
    member: 2,
    type: InvoiceType.MEMBERSHIP,
    status: InvoiceStatus.PAID,
    amount: 12000,
    description: subscriptionInvoiceDescription('Premium', 'MONTH', 'renewal'),
    daysAgo: 6,
    fromSubscription: true,
  },
  {
    member: 2,
    type: InvoiceType.PERSONAL_TRAINING,
    status: InvoiceStatus.PENDING,
    amount: 25000,
    description: 'Personal training — 5-session block',
    daysAgo: 2,
    dueInDays: 12,
  },
  {
    member: 4,
    type: InvoiceType.MEMBERSHIP,
    status: InvoiceStatus.PAID,
    amount: 7500,
    description: subscriptionInvoiceDescription('Standard', 'MONTH', 'renewal'),
    daysAgo: 9,
    fromSubscription: true,
  },
  {
    member: 6,
    type: InvoiceType.CLASS,
    status: InvoiceStatus.PAID,
    amount: 18000,
    description: 'Reformer Pilates — 10-class pass',
    daysAgo: 13,
  },
  {
    member: 8,
    type: InvoiceType.PERSONAL_TRAINING,
    status: InvoiceStatus.REFUNDED,
    amount: 20000,
    description: 'Personal training — block cancelled mid-term',
    daysAgo: 17,
  },
  {
    member: 10,
    type: InvoiceType.MEMBERSHIP,
    status: InvoiceStatus.FAILED,
    amount: 4500,
    description: subscriptionInvoiceDescription('Student', 'MONTH', 'renewal'),
    daysAgo: 3,
    fromSubscription: true,
  },
  {
    member: 12,
    type: InvoiceType.SERVICE,
    status: InvoiceStatus.PENDING,
    amount: 6000,
    description: 'Body-composition assessment',
    daysAgo: 1,
    dueInDays: 7,
  },

  // ── Saburtalo Branch (odd member indices) — 5 rows ─────────────────────
  {
    member: 1,
    type: InvoiceType.MEMBERSHIP,
    status: InvoiceStatus.PAID,
    amount: 12000,
    description: subscriptionInvoiceDescription('Premium', 'MONTH', 'renewal'),
    daysAgo: 5,
    fromSubscription: true,
  },
  {
    member: 3,
    type: InvoiceType.MEMBERSHIP,
    status: InvoiceStatus.PAID,
    amount: 7500,
    description: subscriptionInvoiceDescription('Standard', 'MONTH', 'enrolment'),
    daysAgo: 27,
    fromSubscription: true,
  },
  {
    member: 5,
    type: InvoiceType.PRODUCT,
    status: InvoiceStatus.PAID,
    amount: 10500,
    description: 'Whey protein 2 kg + shaker',
    daysAgo: 8,
  },
  {
    member: 7,
    type: InvoiceType.MEMBERSHIP,
    status: InvoiceStatus.PENDING,
    amount: 20000,
    description: subscriptionInvoiceDescription('PT Pack', 'MONTH', 'renewal'),
    daysAgo: 2,
    dueInDays: 5,
    fromSubscription: true,
  },
  {
    member: 9,
    type: InvoiceType.OTHER,
    status: InvoiceStatus.PAID,
    amount: 2500,
    description: 'Locker rental — quarterly',
    daysAgo: 11,
  },

  // ── Not attributable to any branch — 1 row ─────────────────────────────
  //
  // A renewal raised against a member who has since been purged. This is the ONE
  // shape the write path can still produce a NULL `Invoice.locationId` from, and
  // `invoice.service.spec.ts` names it in as many words: "`memberId: null` is the
  // recurring-billing edge — an invoice that survived a member purge by SetNull".
  // The invoice is a financial record and outlives the person; the branch it was
  // earned at cannot be recovered once there is no member row to read it off.
  {
    member: null,
    type: InvoiceType.MEMBERSHIP,
    status: InvoiceStatus.PAID,
    amount: 12000,
    description: subscriptionInvoiceDescription('Premium', 'MONTH', 'renewal'),
    daysAgo: 22,
  },
];

/**
 * Idempotently write {@link DEMO_INVOICES}, numbering each one off the same
 * `invoice_sequences` counter the API mints from.
 *
 * ## The number
 *
 * Two halves, and they are owned in different places on purpose. The *reference
 * rule* is `formatInvoiceNumber` in `@fit/types` — imported at the top of this file
 * rather than restated, which is exactly what `prisma/invoice-number.ts` warns
 * against doing twice. The *allocation* of `seq` is a database concern, and the
 * statement below mirrors `InvoiceService.allocateSeq` in
 * `apps/api/src/billing/invoice.service.ts` — mirrors rather than imports, because
 * `packages/db` sits UNDER `apps/api` in the dependency graph and cannot reach up
 * into it (and the service is a Nest provider besides). The honest fix is to lift
 * that statement down into `@fit/db` beside `invoice-number.ts` and have the API
 * import it; that is an `apps/api` edit and is left as a follow-up.
 *
 * What matters is that the seed CLAIMS its numbers from the counter instead of
 * inventing them: it reads the gym's Settings → Invoicing (prefix, shape, starting
 * number, all defaulted exactly as the service defaults them), picks the same
 * bucket — the fiscal year for a year-bearing shape, the gym-wide bucket `0` for
 * `prefix-number`, which cannot restart each January without repeating itself — and
 * advances `lastNumber`. The next REAL invoice therefore starts after the seeded
 * ones. A seed that wrote `"INV-2026-1000"` by hand and left the counter at zero
 * would hand the first live charge the very same reference, and
 * `@@unique([gymId, number])` would reject it — on the money path, in dev, for
 * whoever got there first.
 *
 * ## The branch
 *
 * Read off the member, never named by the spec — the same lookup
 * `InvoiceService.memberBranch` performs, `gymId` pinned in the `where` alongside
 * `id` for the same reason it is there (a `memberId` resolving across tenants would
 * copy another gym's branch onto this row). The unattributed invoice is therefore
 * not a hand-written `null`: it is what that rule RETURNS when there is no member
 * to bill. No spec asserts a branch, so none of them can disagree with the member.
 *
 * ## Idempotence
 *
 * Guarded per spec on the tuple `(memberId, type, status, amount, description)`,
 * which is stable across runs — and which is why this does NOT copy
 * {@link ensurePayment}, whose guard is a `createdAt` carrying the current
 * time-of-day and so mints a fresh set every time the seed is re-run at a different
 * minute (a recorded defect, not a pattern to follow). No two specs share that
 * tuple. Skipping a spec skips its counter bump too, so a re-run consumes no
 * numbers: the board is identical on run 2, and the next live invoice gets the same
 * reference it would have on run 1.
 */
async function ensureInvoices(gymId: string, memberIds: readonly string[]): Promise<void> {
  // Fully defaulted, exactly as `InvoiceService.invoiceSettings` does it: a gym
  // that has never opened the settings screen has `settings: null`, and the schema
  // fills every default from that. The seed never writes this blob, so on a fresh
  // database this is `INV` / `prefix-year-number` / `1000` — but a dev who has
  // changed it in the console gets numbers in THEIR shape, not a stale guess.
  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { settings: true } });
  const settings = gymSettingsStoredSchema.parse(gym?.settings ?? {}).invoice;
  const numbering: InvoiceNumbering = { prefix: settings.prefix, format: settings.format };

  for (const [index, spec] of DEMO_INVOICES.entries()) {
    // A spec naming a member the seed did not write is skipped outright rather
    // than falling back to null — that fallback would quietly manufacture extra
    // unattributed rows and make the `(none)` line on the summary meaningless.
    if (spec.member !== null && !memberIds[spec.member]) {
      continue;
    }
    const memberId = spec.member === null ? null : memberIds[spec.member]!;

    const existing = await prisma.invoice.findFirst({
      where: {
        gymId,
        memberId,
        type: spec.type,
        status: spec.status,
        amount: spec.amount,
        description: spec.description,
      },
      select: { id: true },
    });
    if (existing) {
      continue;
    }

    // The attribution, applied rather than declared. `null` here is the rule's
    // answer for "no member to bill", not a value the spec asked for.
    const member =
      memberId === null
        ? null
        : await prisma.gymMember.findFirst({
            where: { id: memberId, gymId },
            select: { locationId: true },
          });
    const locationId = member?.locationId ?? null;

    const subscriptionId =
      spec.fromSubscription === true && memberId !== null
        ? ((
            await prisma.subscription.findFirst({
              where: { gymId, memberId },
              select: { id: true },
              orderBy: { createdAt: 'desc' },
            })
          )?.id ?? null)
        : null;

    // Anchored to a fixed clock hour so a re-seeded board sorts the same way twice
    // and the rows do not all collapse onto the minute the seed happened to run.
    const issuedAt = daysAgo(spec.daysAgo);
    issuedAt.setHours(9 + (index % 9), 0, 0, 0);
    const dueDate =
      spec.dueInDays === undefined
        ? null
        : (() => {
            const d = daysAgo(-spec.dueInDays);
            d.setHours(12, 0, 0, 0);
            return d;
          })();

    const year = issuedAt.getUTCFullYear();
    const bucket = invoiceNumberCarriesYear(numbering) ? year : GYM_WIDE_SEQUENCE_BUCKET;
    const seq = await claimInvoiceSeq(gymId, bucket, settings.startNumber);

    await prisma.invoice.create({
      data: {
        gymId,
        memberId,
        subscriptionId,
        locationId,
        number: formatInvoiceNumber(year, seq, numbering),
        year,
        seq,
        amount: spec.amount,
        currency: 'GEL',
        status: spec.status,
        type: spec.type,
        description: spec.description,
        dueDate,
        issuedAt,
        createdAt: issuedAt,
      },
    });
  }
}

/**
 * The `invoice_sequences` bucket a year-less run of numbers lives in — zero is not
 * a fiscal year, so it is free to mean "this gym's one continuous run". Same
 * constant, same reasoning, as `GYM_WIDE_SEQUENCE_BUCKET` in the API's
 * `InvoiceService`.
 */
const GYM_WIDE_SEQUENCE_BUCKET = 0;

/**
 * Atomically claim the next `seq` from the `invoice_sequences` counter — the same
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING` `InvoiceService.allocateSeq` issues,
 * including the `GREATEST(… + 1, startNumber)` floor so a raised starting number
 * takes effect on the next invoice rather than next January, and lowering it stays
 * inert. Parameterised through Prisma's tagged template; raw because Prisma has no
 * read-old-then-increment-and-return primitive.
 *
 * The seed is single-threaded, so the row lock buys it nothing directly. It is
 * written this way because the number it hands out has to be one the API would
 * never hand out again — sharing the counter is the whole point.
 */
async function claimInvoiceSeq(
  gymId: string,
  bucket: number,
  startNumber: number,
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ lastNumber: number }>>`
    INSERT INTO "invoice_sequences" ("gymId", "year", "lastNumber", "updatedAt")
    VALUES (${gymId}, ${bucket}, ${startNumber}, now())
    ON CONFLICT ("gymId", "year")
    DO UPDATE SET
      "lastNumber" = GREATEST("invoice_sequences"."lastNumber" + 1, ${startNumber}),
      "updatedAt" = now()
    RETURNING "lastNumber"`;
  return rows[0]?.lastNumber ?? startNumber;
}

/**
 * Idempotently create one CAPTURED payment (with its backing paid Order) for a
 * member. Guarded by an existing captured payment at the same instant for the gym,
 * so re-running the seed never stacks duplicate takings.
 *
 * `locationId` is the branch the taking belongs to — here the buying member's home
 * branch, since a membership charge has no till of its own. Stamped on the order
 * AND on the payment: since Stage 5 `Payment` carries its own denormalised copy so
 * revenue can be narrowed by an index instead of a join through `order`, and the
 * two must never disagree.
 *
 * A database seeded before that column existed keeps its payments attributed
 * anyway — migration `20260831140000_money_location_branch` backfills each one
 * from its order — so unlike the member upsert above there is no need to force the
 * value on a re-run. The idempotence guard below still short-circuits first.
 */
async function ensurePayment(
  gymId: string,
  memberId: string,
  amount: number,
  paidAt: Date,
  customerName: string,
  locationId: string | null,
): Promise<void> {
  const existing = await prisma.payment.findFirst({
    where: { gymId, amount, createdAt: paidAt, status: PaymentStatus.CAPTURED },
    select: { id: true },
  });
  if (existing) {
    return;
  }
  const order = await prisma.order.create({
    data: {
      gymId,
      memberId,
      customerName,
      locationId,
      total: amount,
      currency: 'GEL',
      status: OrderStatus.PAID,
      createdAt: paidAt,
      updatedAt: paidAt,
    },
    select: { id: true },
  });
  await prisma.payment.create({
    data: {
      gymId,
      orderId: order.id,
      locationId,
      amount,
      currency: 'GEL',
      status: PaymentStatus.CAPTURED,
      method: PaymentMethod.CARD,
      provider: 'stub',
      createdAt: paidAt,
      updatedAt: paidAt,
    },
  });
}

/**
 * Home-screen promotional banners for the member app's carousel (T1.16).
 *
 * Idempotent on `(gymId, title)` — a re-run leaves an edited banner alone rather
 * than resetting it, like every other fixture here.
 *
 * FOUR rows, and only three of them reach the app, because the listing's filter is
 * the part worth exercising in dev: one is parked (`isActive: false`), so a seeded
 * database that shows four slides means `GET /banners` has stopped honouring the
 * switch. The three live ones carry a mix of destinations — an in-app deep link, an
 * absolute URL, and none at all — since a carousel where every slide is tappable
 * cannot tell a working `linkUrl` from one the client ignores.
 *
 * The artwork is picsum rather than R2: the seed runs against a database with no
 * bucket behind it, and a `null`-image fixture would be filtered straight back out
 * of the listing. `?seed=` keeps each slide's picture stable across re-runs.
 */
async function ensureBanners(gymId: string): Promise<void> {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const banners = [
    {
      title: 'Summer membership — 20% off',
      imageUrl: 'https://picsum.photos/seed/fit-banner-summer/1200/600',
      linkUrl: '/shop',
      sortOrder: 0,
      isActive: true,
      // Already running, ending in a fortnight — the ordinary live campaign.
      startsAt: new Date(now - 7 * day),
      endsAt: new Date(now + 14 * day),
    },
    {
      title: 'New: reformer pilates',
      imageUrl: 'https://picsum.photos/seed/fit-banner-pilates/1200/600',
      linkUrl: 'https://downtown.fit.ge/classes',
      sortOrder: 1,
      isActive: true,
      // Open-ended: no window at all, the state most banners are in.
      startsAt: null,
      endsAt: null,
    },
    {
      title: 'Bring a friend this week',
      imageUrl: 'https://picsum.photos/seed/fit-banner-friend/1200/600',
      // Not tappable — an announcement, which the app must render without a
      // destination rather than skipping.
      linkUrl: null,
      sortOrder: 2,
      isActive: true,
      startsAt: null,
      endsAt: new Date(now + 5 * day),
    },
    {
      title: 'Black Friday (parked)',
      imageUrl: 'https://picsum.photos/seed/fit-banner-bf/1200/600',
      linkUrl: '/shop',
      sortOrder: 3,
      isActive: false,
      startsAt: null,
      endsAt: null,
    },
  ];

  for (const banner of banners) {
    const existing = await prisma.banner.findFirst({
      where: { gymId, title: banner.title },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.banner.create({ data: { gymId, ...banner } });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error('[@fit/db] seed failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
