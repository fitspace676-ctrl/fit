import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { prisma } from '@fit/db';

/**
 * Thin injectable wrapper around the shared `@fit/db` Prisma client.
 *
 * The client itself is a process-wide singleton (memoised on `globalThis` in
 * dev to survive hot-reloads — see `@fit/db`); this service just exposes it
 * through Nest's DI so feature services can depend on `PrismaService` instead of
 * importing the singleton directly, which keeps them unit-testable with a
 * lightweight mock. The connection opens lazily on first query, so `onModuleInit`
 * is a no-op beyond an explicit connect; `onModuleDestroy` closes the pool on
 * shutdown.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  /** The shared Prisma client — query models off `this.client`. */
  readonly client = prisma;

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
