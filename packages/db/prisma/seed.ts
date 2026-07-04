// Development seed for @fit/db.
//
// Inserts two gyms and demonstrates the core multi-tenancy invariant from T2.1:
// a single user can be a member of N gyms with a DIFFERENT role in each. The
// composite unique on (userId, gymId) means a second membership for the same
// pair is rejected — re-running this seed is idempotent via upsert.
//
// Run with:  pnpm db:seed   (or `fit db seed`, or `prisma db seed`)

import {
  prisma,
  Role,
  GymMemberStatus,
  InstanceStatus,
  BookingStatus,
  CheckInMethod,
  LocationStatus,
  NotificationCategory,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  SubscriptionInterval,
  SubscriptionStatus,
  TrainerStatus,
} from '../index';

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
  await prisma.gymMember.upsert({
    where: { userId_gymId: { userId: alex.id, gymId: downtown.id } },
    update: { role: Role.OWNER, status: GymMemberStatus.ACTIVE },
    create: {
      userId: alex.id,
      gymId: downtown.id,
      role: Role.OWNER,
      status: GymMemberStatus.ACTIVE,
    },
  });

  await prisma.gymMember.upsert({
    where: { userId_gymId: { userId: alex.id, gymId: riverside.id } },
    update: { role: Role.TRAINER, status: GymMemberStatus.ACTIVE },
    create: {
      userId: alex.id,
      gymId: riverside.id,
      role: Role.TRAINER,
      status: GymMemberStatus.ACTIVE,
    },
  });

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
  await prisma.gymMember.upsert({
    where: { userId_gymId: { userId: sam.id, gymId: downtown.id } },
    update: { role: Role.MEMBER, status: GymMemberStatus.ACTIVE },
    create: {
      userId: sam.id,
      gymId: downtown.id,
      role: Role.MEMBER,
      status: GymMemberStatus.ACTIVE,
    },
  });

  await prisma.gymMember.upsert({
    where: { userId_gymId: { userId: sam.id, gymId: riverside.id } },
    update: { role: Role.MEMBER, status: GymMemberStatus.INVITED },
    create: {
      userId: sam.id,
      gymId: riverside.id,
      role: Role.MEMBER,
      status: GymMemberStatus.INVITED,
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
  // (T2.12) is reachable out of the box. Gated to non-production: never seed a
  // standing super-admin into a real database. In production the first admin is
  // made by registering a user and running `fit admin grant --email <email>`.
  // Created without a password (consistent with the other seed users); mint a
  // session for it in dev with `fit token --role SUPER_ADMIN`.
  if (process.env.NODE_ENV !== 'production') {
    await prisma.user.upsert({
      where: { email: 'superadmin@fit.local' },
      update: { isSuperAdmin: true },
      create: {
        email: 'superadmin@fit.local',
        name: 'Platform Admin',
        isSuperAdmin: true,
        emailVerifiedAt: new Date(),
      },
    });
  }

  // A recurring class template + its first occurrences (T5.1). Demonstrates the
  // scheduling core: one ClassTemplate (the RRULE *rule*) expands into concrete
  // ClassInstance occurrences. Idempotent — materialised once per gym, keyed on
  // (gymId, title) since a template has no natural unique column.
  const CLASS_TITLE = 'Morning HIIT';
  const existingTemplate = await prisma.classTemplate.findFirst({
    where: { gymId: downtown.id, title: CLASS_TITLE },
  });

  if (!existingTemplate) {
    const template = await prisma.classTemplate.create({
      data: {
        gymId: downtown.id,
        title: CLASS_TITLE,
        description: 'High-intensity interval training to start the day.',
        category: 'Conditioning',
        capacity: 20,
        durationMinutes: 60,
        // Every Mon/Wed/Fri — the canonical weekly RRULE the generator (T5.3) expands.
        rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
        color: '#ef4444',
        validFrom: new Date('2026-06-08T00:00:00.000Z'),
      },
    });

    // Materialise the first 4 weekly occurrences (08:00–09:00 UTC) so the
    // calendar and booking flows have data to render against in local dev.
    const firstStart = new Date('2026-06-08T08:00:00.000Z'); // a Monday
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
          status: InstanceStatus.SCHEDULED,
        };
      }),
    });
  }

  // ── Demo enrichment for the `downtown` gym (dashboard/analytics fixtures) ──
  //
  // Populates the control-room dashboard with realistic, tenant-scoped data so the
  // FormaCore reference screen renders against real queries: subscription plans +
  // members on them, captured payments across the last ~30 days, trainers,
  // locations (the dashboard's "areas"), today's classes with bookings, and
  // today's check-ins. Every insert is guarded by existence/upsert — idempotent
  // and non-destructive, safe to re-run, never deletes.
  await enrichDowntown(downtown.id);

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
  const downtownCheckInsToday = await prisma.checkIn.count({
    where: { gymId: downtown.id, checkedInAt: { gte: startOfToday() } },
  });

  console.log('[@fit/db] seed complete:', {
    gyms: [downtown.slug, riverside.slug],
    alexRoles: memberships.map((m) => m.role),
    classTemplate: `${CLASS_TITLE} (${classInstanceCount} instances)`,
    downtownMembers,
    downtownCheckInsToday,
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

/** The demo trainers the schedule + trainer index render. */
const DEMO_TRAINERS = ['Ana G.', 'Levan M.', 'Sandro K.', 'Nika B.'] as const;

/** The demo locations — the dashboard's live-occupancy "areas". */
const DEMO_LOCATIONS = ['Main Floor', 'Studio A'] as const;

/**
 * The demo classes materialised for *today* so the schedule / alerts / bookings
 * light up. `hour` is local-time start; `capacity` is the occurrence capacity;
 * `booked` is how many confirmed bookings to seed (kept under capacity, one row
 * near-full to exercise the "≥90% full" alert).
 */
const DEMO_TODAY_CLASSES = [
  { title: 'Morning Yoga', hour: 8, capacity: 20, booked: 14, color: '#10B981', trainer: 'Ana G.' },
  {
    title: 'CrossFit WOD',
    hour: 12,
    capacity: 14,
    booked: 14,
    color: '#EC4899',
    trainer: 'Levan M.',
  },
  {
    title: 'Spin Express',
    hour: 18,
    capacity: 24,
    booked: 20,
    color: '#7C3AED',
    trainer: 'Sandro K.',
  },
  {
    title: 'Boxing Basics',
    hour: 19,
    capacity: 12,
    booked: 7,
    color: '#F59E0B',
    trainer: 'Nika B.',
  },
] as const;

/**
 * Idempotently populate the `downtown` gym. Guards every insert by existence /
 * upsert; never deletes. Uses fixed timestamps derived from `new Date()` at seed
 * runtime so "today" is always the real current day.
 */
async function enrichDowntown(gymId: string): Promise<void> {
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
  const trainerIdByName = new Map<string, string>();
  for (const name of DEMO_TRAINERS) {
    const existing = await prisma.trainer.findFirst({
      where: { gymId, name },
      select: { id: true },
    });
    if (existing) {
      trainerIdByName.set(name, existing.id);
      continue;
    }
    const created = await prisma.trainer.create({
      data: { gymId, name, headline: `${name} · Coach`, status: TrainerStatus.ACTIVE },
      select: { id: true },
    });
    trainerIdByName.set(name, created.id);
  }

  // ── Locations (the dashboard's areas; upsert by name) ───────────────────
  const locationIds: string[] = [];
  for (const name of DEMO_LOCATIONS) {
    const existing = await prisma.location.findFirst({
      where: { gymId, name },
      select: { id: true },
    });
    if (existing) {
      locationIds.push(existing.id);
      continue;
    }
    const created = await prisma.location.create({
      data: { gymId, name, status: LocationStatus.ACTIVE },
      select: { id: true },
    });
    locationIds.push(created.id);
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
    const membership = await prisma.gymMember.upsert({
      where: { userId_gymId: { userId: user.id, gymId } },
      update: {},
      create: {
        userId: user.id,
        gymId,
        role: Role.MEMBER,
        status: GymMemberStatus.ACTIVE,
        joinedAt,
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
    if (planPrice > 0) {
      for (let k = 0; k < 2; k++) {
        // Recent one for a couple of members lands today so "today's revenue" pops.
        const paidAt = k === 0 && i < 3 ? todayAt(9 + i, 15) : daysAgo(3 + i + k * 11);
        await ensurePayment(gymId, membership.id, planPrice, paidAt, spec.name);
      }
    }
  }

  // ── Today's classes (templates → today's instance) + bookings ───────────
  for (const cls of DEMO_TODAY_CLASSES) {
    const trainerId = trainerIdByName.get(cls.trainer) ?? null;
    const locationId = locationIds[0] ?? null;

    let template = await prisma.classTemplate.findFirst({
      where: { gymId, title: cls.title },
      select: { id: true },
    });
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
          validFrom: daysAgo(30),
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

  // ── Today's check-ins (varied members / locations) ──────────────────────
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
}

/**
 * Idempotently create one CAPTURED payment (with its backing paid Order) for a
 * member. Guarded by an existing captured payment at the same instant for the gym,
 * so re-running the seed never stacks duplicate takings.
 */
async function ensurePayment(
  gymId: string,
  memberId: string,
  amount: number,
  paidAt: Date,
  customerName: string,
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

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error('[@fit/db] seed failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
