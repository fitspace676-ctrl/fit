// Shared helpers for the API's integration tests (`*.int-spec.ts`), which run
// against a real Postgres via the shared `@fit/db` client. Migrations are
// applied out-of-band (CI / docker-compose run `prisma migrate deploy` before
// the tests); each test resets the tables it touches to start from a clean slate.

import { prisma } from '@fit/db';
import { tenantExtension } from '../common/prisma/prisma-tenant.extension';

/** The raw (unscoped) client — for arranging fixtures across tenants. */
export { prisma };

/**
 * The tenant-scoped client, wrapped exactly as `TenantPrismaService` wraps it in
 * production. The extension reads the active tenant from `tenantStorage` at query
 * time, so scope a query by running it inside `tenantStorage.run(state, …)`.
 */
export const tenantPrisma = prisma.$extends(tenantExtension());

/**
 * Truncate every table so each test starts clean. `CASCADE` clears dependent
 * rows; `RESTART IDENTITY` resets any sequences. Listed table names match the
 * Prisma `@@map` names.
 */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "refresh_tokens", "gym_members", "gyms", "users" RESTART IDENTITY CASCADE',
  );
}

/** Close the connection pool once a suite finishes. */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
