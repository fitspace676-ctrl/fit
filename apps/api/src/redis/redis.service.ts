import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Thin wrapper around a single shared ioredis connection.
 *
 * The client connects lazily so the API can boot (and serve `/health`, which
 * reports the failure) even when Redis is temporarily unreachable. The
 * connection URL comes from `REDIS_URL` (see the repo-level `.env.example`).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      // Don't spam reconnect attempts in environments where Redis is absent;
      // `/health` surfaces the outage instead.
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
    });

    this.client.on('error', (err: Error) => {
      this.logger.warn(`Redis connection error: ${err.message}`);
    });
  }

  /** Issue a PING and resolve true on a `PONG` reply. */
  async ping(): Promise<boolean> {
    if (this.client.status === 'wait' || this.client.status === 'end') {
      await this.client.connect();
    }
    const reply = await this.client.ping();
    return reply === 'PONG';
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
