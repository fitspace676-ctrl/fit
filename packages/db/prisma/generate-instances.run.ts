// Runnable entry for the T5.3 class-instance generator.
//
// Mirrors `seed.ts`: a thin wrapper that runs one generation pass against the
// shared Prisma client and disconnects. Intended to be invoked on a schedule
// (e.g. a daily Railway cron) via:
//
//   pnpm db:generate-instances           # from the repo root
//   pnpm --filter @fit/db jobs:generate-instances
//   fit db generate-instances
//
// Each run extends the booking horizon to `now + 4 weeks`; it is idempotent, so
// re-running only adds the occurrences that have newly entered the window.

import { prisma } from '../index';
import { generateClassInstances } from './generate-instances';

async function main(): Promise<void> {
  const result = await generateClassInstances(prisma);
  console.log('[@fit/db] class-instance generation complete:', {
    window: `${result.windowStart} → ${result.windowEnd}`,
    templatesProcessed: result.templatesProcessed,
    instancesCreated: result.instancesCreated,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error('[@fit/db] class-instance generation failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
