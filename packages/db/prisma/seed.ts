// Development seed for @fit/db.
//
// Inserts two gyms and demonstrates the core multi-tenancy invariant from T2.1:
// a single user can be a member of N gyms with a DIFFERENT role in each. The
// composite unique on (userId, gymId) means a second membership for the same
// pair is rejected — re-running this seed is idempotent via upsert.
//
// Run with:  pnpm db:seed   (or `fit db seed`, or `prisma db seed`)

import { prisma, Role, GymMemberStatus, InstanceStatus } from '../index';

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

  const memberships = await prisma.gymMember.findMany({
    where: { userId: alex.id },
    select: { gymId: true, role: true },
  });

  const classInstanceCount = await prisma.classInstance.count({
    where: { gymId: downtown.id },
  });

  console.log('[@fit/db] seed complete:', {
    gyms: [downtown.slug, riverside.slug],
    alexRoles: memberships.map((m) => m.role),
    classTemplate: `${CLASS_TITLE} (${classInstanceCount} instances)`,
    superAdmin:
      process.env.NODE_ENV !== 'production' ? 'superadmin@fit.local' : '(skipped in prod)',
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
