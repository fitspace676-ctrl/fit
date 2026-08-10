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
  generateClassInstances,
  Role,
  GymMemberStatus,
  InstanceStatus,
  ClassPricingRule,
  ClassTypeStatus,
  BookingStatus,
  CheckInMethod,
  LocationStatus,
  NotificationCategory,
  OrderStatus,
  PackageBillingInterval,
  PackagePlanStatus,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
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
  // (gymId, classTypeId, startsAt).
  const singleOccurrences = [
    { name: 'Boxing', dayOffset: 0, hour: 20, minutes: 60, capacity: 16 },
    { name: 'Pilates', dayOffset: 1, hour: 10, minutes: 50, capacity: 18 },
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
          status: InstanceStatus.SCHEDULED,
        },
      });
    }
  }

  // ── Demo / pilot enrichment for the `downtown` gym (T10.3) ────────────────
  //
  // Populates a realistic, tenant-scoped dataset so a pilot gym opens onto a fully
  // furnished console: subscription plans + members on them, captured payments
  // across the last ~30 days, trainers, locations (the dashboard's "areas"),
  // today's classes with bookings, today's check-ins, staff login fixtures (one
  // per role), the retail shop catalogue, and the PT / class-pass packages. The
  // forward 4-week class schedule is materialised separately below. Every insert
  // is guarded by existence/upsert — idempotent and non-destructive, safe to
  // re-run, never deletes.
  await enrichDowntown(downtown.id);

  // A few 1:1 PT sessions this week so the PT Calendar tab opens onto data. Scoped
  // to the first active trainer + first member of `downtown`; idempotent on
  // (gymId, trainerId, startsAt). Skipped if the gym has no trainer or member yet.
  const ptTrainer = await prisma.trainer.findFirst({
    where: { gymId: downtown.id, status: TrainerStatus.ACTIVE },
    select: { id: true },
    orderBy: { name: 'asc' },
  });
  // A PT session is a trainer + a workout type (class type) — no member. Attach the
  // first seeded class type so the calendar shows named blocks.
  const ptClassTypeId = classTypeIdByName.values().next().value ?? null;
  if (ptTrainer && ptClassTypeId) {
    const ptSessions = [
      { dayOffset: 0, hour: 9, minutes: 60 },
      { dayOffset: 2, hour: 14, minutes: 45 },
      { dayOffset: 4, hour: 18, minutes: 60 },
    ];
    for (const pt of ptSessions) {
      const startsAt = new Date();
      startsAt.setUTCDate(startsAt.getUTCDate() + pt.dayOffset);
      startsAt.setUTCHours(pt.hour, 0, 0, 0);
      const existing = await prisma.ptSession.findFirst({
        where: { gymId: downtown.id, trainerId: ptTrainer.id, startsAt },
        select: { id: true, classTypeId: true },
      });
      if (!existing) {
        await prisma.ptSession.create({
          data: {
            gymId: downtown.id,
            trainerId: ptTrainer.id,
            classTypeId: ptClassTypeId,
            startsAt,
            endsAt: new Date(startsAt.getTime() + pt.minutes * 60 * 1000),
            status: InstanceStatus.SCHEDULED,
          },
        });
      } else if (!existing.classTypeId) {
        // Backfill a workout type onto a legacy row that predates the member→type change.
        await prisma.ptSession.update({
          where: { id: existing.id },
          data: { classTypeId: ptClassTypeId },
        });
      }
    }
  }

  // Materialise every active template's occurrences out to the standard 4-week
  // booking horizon (the same pass the T5.3 cron runs), so a pilot demo opens onto
  // a full forward schedule rather than just today's classes. Idempotent — it only
  // adds occurrences newly inside the window, so re-seeding never duplicates.
  const generation = await generateClassInstances(prisma);

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

  console.log('[@fit/db] seed complete:', {
    gyms: [downtown.slug, riverside.slug],
    alexRoles: memberships.map((m) => m.role),
    classInstances: `${classInstanceCount} (downtown, incl. ${generation.instancesCreated} generated to +4wk)`,
    downtownMembers,
    downtownStaff,
    downtownProducts,
    downtownPackages,
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
 * Staff login fixtures for the `downtown` pilot gym — one non-MEMBER membership
 * per {@link Role} the console gates on, each backed by a real (verified) user so
 * a pilot operator can sign into the admin console as any role out of the box.
 * They share the dev password (**Test1234!**) via {@link DEV_PASSWORD_HASH}, so
 * these are demo/dev credentials only — never real ones. Upserted by email + the
 * (userId, gymId) membership unique, so re-running the seed never duplicates them.
 */
const DEMO_STAFF = [
  { name: 'Mariam Beridze', email: 'manager@downtown.demo', role: Role.MANAGER },
  { name: 'Giorgi Nadiradze', email: 'reception@downtown.demo', role: Role.RECEPTIONIST },
  { name: 'Coach Nia', email: 'coach@downtown.demo', role: Role.TRAINER },
] as const;

/** One purchasable variant of a demo {@link DEMO_PRODUCTS} product. `stock` is the
 * on-hand count (a couple are intentionally at/near the low-stock threshold so the
 * catalog's low-stock alert has something to surface); `priceAmount` null inherits
 * the product's base price. Mirrors the `productVariantSchema` JSON the admin form
 * stores in `Product.variants`. */
type DemoVariant = { name: string; sku: string; stock: number; priceAmount?: number };

/**
 * The retail shop catalogue for the `downtown` pilot gym so the storefront (member
 * shop + admin catalog + POS) renders against real data instead of an empty store.
 * Prices are in GEL minor units (tetri). A mix of variant-bearing and sold-as-is
 * products, one deliberately low on stock and one `INACTIVE`, exercises the roster
 * badges, the low-stock report, and the active/inactive filter. Galleries are left
 * empty so cards render the designed placeholder rather than broken image links.
 * Upserted by (gymId, name) — re-running never duplicates or re-prices a product.
 */
const DEMO_PRODUCTS: ReadonlyArray<{
  name: string;
  description: string;
  priceAmount: number;
  status: ProductStatus;
  variants: DemoVariant[];
}> = [
  {
    name: 'Branded Training Tee',
    description: 'Breathable performance tee with the club logo.',
    priceAmount: 4500,
    status: ProductStatus.ACTIVE,
    variants: [
      { name: 'S', sku: 'TEE-S', stock: 12 },
      { name: 'M', sku: 'TEE-M', stock: 20 },
      { name: 'L', sku: 'TEE-L', stock: 8 },
      { name: 'XL', sku: 'TEE-XL', stock: 3 },
    ],
  },
  {
    name: 'Whey Protein 1kg',
    description: 'Post-workout whey isolate — 25g protein per serving.',
    priceAmount: 8900,
    status: ProductStatus.ACTIVE,
    variants: [
      { name: 'Chocolate', sku: 'WHEY-CHOC', stock: 15 },
      { name: 'Vanilla', sku: 'WHEY-VAN', stock: 2, priceAmount: 9500 },
    ],
  },
  {
    name: 'Insulated Shaker Bottle',
    description: '700ml steel shaker that keeps drinks cold for hours.',
    priceAmount: 2500,
    status: ProductStatus.ACTIVE,
    variants: [],
  },
  {
    name: 'Resistance Bands Set',
    description: 'Five looped bands from light to heavy, with a carry pouch.',
    priceAmount: 3900,
    status: ProductStatus.ACTIVE,
    variants: [],
  },
  {
    name: 'Microfibre Gym Towel',
    description: 'Quick-dry towel sized for the bench and the bag.',
    priceAmount: 1800,
    status: ProductStatus.ACTIVE,
    variants: [{ name: 'Standard', sku: 'TWL-STD', stock: 4 }],
  },
  {
    name: 'Retired Logo Hoodie',
    description: 'Last season’s hoodie — kept for order history, no longer sold.',
    priceAmount: 6500,
    status: ProductStatus.INACTIVE,
    variants: [{ name: 'M', sku: 'HOOD-M', stock: 0 }],
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

  // ── Staff (login fixtures, one per non-MEMBER role) ─────────────────────
  // The staff membership ids are kept because the till sales below are attributed
  // to them — `Order.soldById` is a `GymMember`, not a `User`.
  const staffIdByEmail = new Map<string, string>();
  for (const staff of DEMO_STAFF) {
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
      update: { role: staff.role, status: GymMemberStatus.ACTIVE },
      create: {
        userId: user.id,
        gymId,
        role: staff.role,
        status: GymMemberStatus.ACTIVE,
      },
      select: { id: true },
    });
    staffIdByEmail.set(staff.email, membership.id);
  }

  // ── Retail shop catalogue (upsert by name) ──────────────────────────────
  for (const spec of DEMO_PRODUCTS) {
    const existing = await prisma.product.findFirst({
      where: { gymId, name: spec.name },
      select: { id: true },
    });
    if (existing) {
      continue;
    }
    await prisma.product.create({
      data: {
        gymId,
        name: spec.name,
        description: spec.description,
        priceAmount: spec.priceAmount,
        currency: 'GEL',
        status: spec.status,
        variants: spec.variants.map((v) => ({
          name: v.name,
          sku: v.sku,
          priceAmount: v.priceAmount ?? null,
          stock: v.stock,
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

  // ── Till sales (POS), attributed to the staff who rang them ─────────────
  await ensureTillSales(gymId, staffIdByEmail);
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
 */
const DEMO_TILL_SALES: ReadonlyArray<{
  daysAgo: number;
  hour: number;
  soldBy: string;
  method: PaymentMethod;
  lines: Array<{ label: string; unitPrice: number; qty: number }>;
  /** Set when the sale was later refunded, with the operator's note. */
  refund?: { reason: string; processedBy: string; daysAgo: number };
}> = [
  {
    daysAgo: 0,
    hour: 9,
    soldBy: 'reception@downtown.demo',
    method: PaymentMethod.CASH,
    lines: [{ label: 'Insulated Shaker Bottle', unitPrice: 2500, qty: 1 }],
  },
  {
    daysAgo: 0,
    hour: 14,
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
    soldBy: 'manager@downtown.demo',
    method: PaymentMethod.MEMBER_ACCOUNT,
    lines: [{ label: 'Resistance Bands Set', unitPrice: 3900, qty: 1 }],
  },
  {
    daysAgo: 9,
    hour: 16,
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
    soldBy: 'manager@downtown.demo',
    method: PaymentMethod.CARD,
    lines: [{ label: 'Whey Protein 1kg', unitPrice: 8900, qty: 2 }],
  },
  {
    daysAgo: 20,
    hour: 8,
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
 */
async function ensureTillSales(
  gymId: string,
  staffIdByEmail: ReadonlyMap<string, string>,
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

    const order = await prisma.order.create({
      data: {
        gymId,
        soldById,
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
