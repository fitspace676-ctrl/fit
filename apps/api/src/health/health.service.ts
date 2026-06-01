import { Inject, Injectable } from '@nestjs/common';
import { prisma } from '@fit/db';
import { RedisService } from '../redis/redis.service';

/** Status of a single downstream dependency. */
export type DependencyStatus = 'ok' | 'error';

export interface HealthReport {
  db: DependencyStatus;
  redis: DependencyStatus;
}

/**
 * Pings the API's hard dependencies (Postgres via Prisma, Redis) and reports
 * each one's reachability. Used by {@link HealthController} to back
 * `GET /health`.
 */
@Injectable()
export class HealthService {
  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  async check(): Promise<HealthReport> {
    const [db, redis] = await Promise.all([this.pingDatabase(), this.pingRedis()]);
    return { db, redis };
  }

  /** True when every dependency reports `ok`. */
  isHealthy(report: HealthReport): boolean {
    return report.db === 'ok' && report.redis === 'ok';
  }

  private async pingDatabase(): Promise<DependencyStatus> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async pingRedis(): Promise<DependencyStatus> {
    try {
      return (await this.redis.ping()) ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  }
}
