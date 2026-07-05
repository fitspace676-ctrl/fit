// Extra fixtures for the mobile Maestro smoke suite (apps/mobile/.maestro).
//
// The base seed (`seed.ts`) creates the tenants, the `sam@example.com` member,
// and today's bookable classes — everything the login / book-class / QR flows
// need. It does NOT seed the shop catalogue, so the shop-checkout flow would hit
// an empty store. This script adds one ACTIVE, variant-less product to the
// `downtown` gym so `04-shop-checkout` has something to buy.
//
// Idempotent: it no-ops when a smoke product already exists, so it is safe to
// run on top of an already-seeded database.

import { prisma } from '../index';

const SMOKE_PRODUCT_NAME = 'Smoke Test Water Bottle';

async function main(): Promise<void> {
  const downtown = await prisma.gym.findUnique({
    where: { slug: 'downtown' },
    select: { id: true },
  });
  if (!downtown) {
    throw new Error(
      'mobile-smoke seed: the `downtown` gym is missing — run `pnpm --filter @fit/db db:seed` first.',
    );
  }

  const existing = await prisma.product.findFirst({
    where: { gymId: downtown.id, name: SMOKE_PRODUCT_NAME },
    select: { id: true },
  });
  if (existing) {
    console.log('[@fit/db] mobile-smoke seed: product already present, skipping.');
    return;
  }

  // Variant-less → untracked, unlimited stock, so the shop → cart → checkout
  // path never trips the stock guard (mirrors the Playwright member fixture).
  const product = await prisma.product.create({
    data: {
      gymId: downtown.id,
      name: SMOKE_PRODUCT_NAME,
      description: 'Insulated steel bottle — mobile smoke fixture.',
      priceAmount: 1500,
      currency: 'GEL',
      status: 'ACTIVE',
      variants: [],
    },
    select: { id: true },
  });

  console.log('[@fit/db] mobile-smoke seed: created product', product.id);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
