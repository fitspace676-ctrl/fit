import { Controller, Get, HttpCode, HttpStatus, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService, type HealthReport } from './health.service';

/**
 * `GET /health` — liveness/readiness probe.
 *
 * Returns `{ db, redis }` with each dependency's status. Responds 200 when both
 * are reachable and 503 when either is down, so orchestrators (Railway, load
 * balancers) can gate traffic on a real readiness signal.
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const report = await this.health.check();
    if (!this.health.isHealthy(report)) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }
}
