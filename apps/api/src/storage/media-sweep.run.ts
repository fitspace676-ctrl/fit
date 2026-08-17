// Validate the environment first, mirroring `main.ts`, so a misconfigured run
// fails immediately with a clear error rather than midway through the sweep.
import { env } from '../config/env';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MediaSweepService } from './media-sweep.service';

/**
 * Manual entry point for the media sweep: `pnpm --filter @fit/api jobs:sweep-media`.
 *
 * Runs exactly what the 03:30 cron runs, but on demand and without the Redis
 * single-runner lock (a human asked for this one) — so a dry run's report can be
 * reviewed before `MEDIA_SWEEP_DRY_RUN` is turned off, and so a cleanup can be
 * triggered without waiting for the night. `MEDIA_SWEEP_ENABLED` is deliberately
 * *not* consulted: that flag gates the unattended schedule, not a deliberate run.
 *
 * Exits non-zero on failure so a CI or ops runner can detect it.
 */
async function main(): Promise<void> {
  const context = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const summary = await context.get(MediaSweepService).sweep(new Date());
    const mode = summary.dryRun ? 'DRY RUN — nothing was deleted' : 'live';
    console.log(
      [
        `Media sweep (${mode})`,
        `  bucket:           ${env.R2_BUCKET ?? '(unset)'}`,
        `  scanned:          ${summary.scanned}`,
        `  referenced:       ${summary.referenced}`,
        `  orphaned:         ${summary.orphaned}`,
        `  deleted:          ${summary.deleted}`,
        `  within grace:     ${summary.skippedInGrace} (< ${env.MEDIA_SWEEP_GRACE_HOURS}h old)`,
      ].join('\n'),
    );
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error(`Media sweep failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
