// Shared helpers for the API's integration tests (`*.int-spec.ts`), which run
// against a real Postgres via the shared `@fit/db` client. Migrations are
// applied out-of-band (CI / docker-compose run `prisma migrate deploy` before
// the tests); each test resets the tables it touches to start from a clean slate.

import { prisma } from '@fit/db';
import { tenantExtension } from '../common/prisma/prisma-tenant.extension';
import { tenantStorage, type TenantState } from '../common/tenant/tenant.context';

/** The raw (unscoped) client — for arranging fixtures across tenants. */
export { prisma };

/**
 * The tenant-scoped client, wrapped exactly as `TenantPrismaService` wraps it in
 * production. The extension reads the active tenant from `tenantStorage` at query
 * time, so a scoped query must run inside an open store — use {@link asTenant}.
 */
export const tenantPrisma = prisma.$extends(tenantExtension());

/**
 * Run a scoped query under `state`. The query is **awaited inside** the
 * `tenantStorage.run` callback so the ALS store is still active when Prisma
 * evaluates the extension's `$allOperations` hook (which it does on a later tick,
 * not synchronously at call time) — exactly as a request handler awaits its
 * queries inside the store the middleware opened.
 */
export function asTenant<T>(state: TenantState, query: () => Promise<T>): Promise<T> {
  return tenantStorage.run(state, async () => await query());
}

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
