// Runnable entry for the T8.5 credit-pack expiry job.
//
// Mirrors `generate-instances.run.ts`: a thin wrapper that runs one expiry pass
// against the shared Prisma client and disconnects. Intended to be invoked on a
// schedule (e.g. a daily Railway cron at midnight UTC) via:
//
//   pnpm db:expire-credit-packs           # from the repo root
//   pnpm --filter @fit/db jobs:expire-credit-packs
//
// Each run flips every credit pack whose `expiresAt` has passed to `EXPIRED`; it
// is idempotent, so re-running only touches packs that have newly lapsed.

import { prisma } from '../index';
import { expireCreditPacks } from './expire-credit-packs';

async function main(): Promise<void> {
  const result = await expireCreditPacks(prisma);
  console.log('[@fit/db] credit-pack expiry complete:', {
    now: result.now,
    packsExpired: result.packsExpired,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error('[@fit/db] credit-pack expiry failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
