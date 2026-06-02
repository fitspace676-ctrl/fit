// Development seed for @fit/db.
//
// Inserts two gyms and demonstrates the core multi-tenancy invariant from T2.1:
// a single user can be a member of N gyms with a DIFFERENT role in each. The
// composite unique on (userId, gymId) means a second membership for the same
// pair is rejected — re-running this seed is idempotent via upsert.
//
// Run with:  pnpm db:seed   (or `fit db seed`, or `prisma db seed`)

import { prisma, Role, GymMemberStatus } from '../index';

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
    update: {},
    create: { email: 'alex@example.com', name: 'Alex Owner' },
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
    update: {},
    create: { email: 'sam@example.com', name: 'Sam Member' },
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

  const memberships = await prisma.gymMember.findMany({
    where: { userId: alex.id },
    select: { gymId: true, role: true },
  });

  console.log('[@fit/db] seed complete:', {
    gyms: [downtown.slug, riverside.slug],
    alexRoles: memberships.map((m) => m.role),
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
