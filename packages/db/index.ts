// @fit/db — Prisma client entrypoint.
//
// Exposes a single shared PrismaClient instance plus the generated model types
// and enums. Consumers should import from `@fit/db`:
//
//   import { prisma, UserRole, type User } from '@fit/db';
//
// The client is memoised on `globalThis` in non-production environments so that
// hot-reloading dev servers don't exhaust the connection pool by instantiating
// a new client on every reload.

import { PrismaClient } from './generated/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from './generated/client';

// Recurring class-instance generation + regeneration (T5.3 / T5.8). Re-exported
// so the API can reconcile a template's future occurrences after an edit without
// reaching into the package's internal file layout.
export {
  DEFAULT_WEEKS_AHEAD,
  generateClassInstances,
  occurrencesInWindow,
  planInstanceRegeneration,
  type ExistingInstance,
  type GenerateClassInstancesOptions,
  type GenerateClassInstancesResult,
  type GenerateClassInstancesTemplateResult,
  type GeneratorPrisma,
  type InstanceRegenerationPlan,
  type PlanInstanceRegenerationInput,
} from './prisma/generate-instances';
