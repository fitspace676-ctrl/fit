// `@fit/db`'s entrypoint is a `.ts` source that this package's ESM loader
// (`"type": "module"`) can't import at runtime, so reach straight for the
// generated Prisma client's compiled JS. It's a plain CommonJS module, so
// default-import it and read the class off the interop default (named ESM imports
// of a CJS module are cjs-lexer-dependent). Prisma's field types are string-literal
// unions, so enum values below are written as the literals they equal (`'ACTIVE'`).
import prismaClientPkg from '@fit/db/generated/client/index.js';

const { PrismaClient } = prismaClientPkg;

/** A dedicated client for the fixtures; closed via {@link disconnectFixtures}. */
const prisma = new PrismaClient();

/** Close the fixture Prisma connection (call from the spec's `afterAll`). */
export async function disconnectFixtures(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Test fixtures for the member booking + checkout E2E (T9.4), written straight to
 * the database with the **base** (non-tenant) Prisma client.
 *
 * The member portal is a customer-facing surface, so a handful of preconditions
 * for the journey can't be produced through its own UI and are simulated here
 * instead — exactly the out-of-band steps a real member would go through:
 *
 *   - **A catalogue to act on.** The seed ships gyms/classes/users but no retail
 *     products, and its demo classes are pinned to fixed dates; {@link seedMemberCatalogue}
 *     adds a product plus two *future* occurrences (one with seats, one held full)
 *     the spec deep-links into.
 *   - **A usable account.** Registration creates an *unverified*, gym-less user
 *     and never issues a session; {@link provisionMember} verifies the email,
 *     enrols the account into the gym, and grants an entitling subscription — the
 *     email-link click + membership a registered member ends up with — so login
 *     and a confirmed (credit-drawing) booking both succeed.
 *
 * Everything is keyed to the caller's per-run id, so the suite is safe to re-run
 * against the same database.
 */

/** The gym the member portal is driven against — seeded by `pnpm db:seed`. */
const GYM_SLUG = 'downtown';

/** Resolve the seeded `downtown` gym's id, or fail loudly if the seed is absent. */
async function downtownGymId(): Promise<string> {
  const gym = await prisma.gym.findUnique({ where: { slug: GYM_SLUG }, select: { id: true } });
  if (!gym) {
    throw new Error(
      `Fixture setup: gym "${GYM_SLUG}" not found. Run \`pnpm db:migrate && pnpm db:seed\` first.`,
    );
  }
  return gym.id;
}

/** `n` days from now, preserving the current time-of-day. */
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

/** `base` plus `minutes`. */
function plusMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

/** The catalogue ids the spec drives against. */
export interface MemberCatalogue {
  gymId: string;
  /** A future occurrence with free seats — the booking (capacity) path. */
  bookableClassId: string;
  /** A future occurrence held at zero capacity — every booking is waitlisted. */
  fullClassId: string;
  /** The retail product the shop → cart → checkout path buys. */
  productName: string;
}

/**
 * Seed the member-independent catalogue: one retail product and two future class
 * occurrences (one bookable, one full). Idempotent per `runId` — the entities are
 * uniquely named/dated, so re-running never collides.
 */
export async function seedMemberCatalogue(runId: number): Promise<MemberCatalogue> {
  const gymId = await downtownGymId();

  // Sold as-is (no variants → untracked, unlimited stock) so the shop → cart →
  // checkout path never trips the stock guard on a fixture with no inventory.
  const product = await prisma.product.create({
    data: {
      gymId,
      name: `E2E Water Bottle ${runId}`,
      description: 'Insulated steel bottle — E2E fixture.',
      priceAmount: 1500,
      currency: 'GEL',
      status: 'ACTIVE',
      variants: [],
    },
  });

  const template = await prisma.classTemplate.create({
    data: {
      gymId,
      title: `E2E Booking Class ${runId}`,
      description: 'Fixture class for the member booking E2E.',
      category: 'Conditioning',
      capacity: 20,
      durationMinutes: 60,
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
    },
  });

  const bookableStart = daysFromNow(2);
  const bookable = await prisma.classInstance.create({
    data: {
      gymId,
      templateId: template.id,
      startsAt: bookableStart,
      endsAt: plusMinutes(bookableStart, template.durationMinutes),
      status: 'SCHEDULED',
      bookedCount: 0,
    },
  });

  const fullStart = daysFromNow(3);
  const full = await prisma.classInstance.create({
    data: {
      gymId,
      templateId: template.id,
      startsAt: fullStart,
      endsAt: plusMinutes(fullStart, template.durationMinutes),
      status: 'SCHEDULED',
      // Zero seats for this occurrence, so the atomic seat gate (`bookedCount <
      // capacity`) can never open — every booking attempt is queued onto the
      // waitlist. No filler bookings/members needed.
      capacityOverride: 0,
      bookedCount: 0,
    },
  });

  return {
    gymId,
    bookableClassId: bookable.id,
    fullClassId: full.id,
    productName: product.name,
  };
}

/**
 * Bring a freshly *registered* account to the state a real member reaches before
 * they can book: email verified, enrolled as an ACTIVE `MEMBER` of the gym, and
 * covered by an entitling (ACTIVE) subscription. Registration (`POST /auth/register`)
 * leaves the user unverified and gym-less, and the portal offers no in-band way to
 * verify or enrol, so those steps are simulated here. Idempotent.
 */
export async function provisionMember(email: string, gymId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerifiedAt: true },
  });
  if (!user) {
    throw new Error(`provisionMember: no user for "${email}" — did the register step run first?`);
  }

  // The emailed verification link, clicked.
  if (!user.emailVerifiedAt) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  }

  // The gym membership a self-registered account doesn't get on its own.
  const member = await prisma.gymMember.upsert({
    where: { userId_gymId: { userId: user.id, gymId } },
    update: { status: 'ACTIVE', role: 'MEMBER' },
    create: { userId: user.id, gymId, role: 'MEMBER', status: 'ACTIVE' },
  });

  // An entitling subscription, so a confirmed seat draws no class credit (an
  // unentitled member would be refused with `422 INSUFFICIENT_CREDITS`).
  const entitled = await prisma.subscription.findFirst({
    where: {
      gymId,
      memberId: member.id,
      status: {
        in: ['ACTIVE', 'TRIAL', 'PAST_DUE'],
      },
    },
    select: { id: true },
  });
  if (!entitled) {
    await prisma.subscription.create({
      data: {
        gymId,
        memberId: member.id,
        status: 'ACTIVE',
        priceAmount: 0,
        currency: 'GEL',
        interval: 'MONTH',
        currentPeriodEnd: daysFromNow(30),
      },
    });
  }
}
