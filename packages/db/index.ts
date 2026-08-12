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
  gymTimeZone,
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

// Subscription lifecycle state machine (T8.3). The single source of truth for the
// legal transitions between SubscriptionStatus states, re-exported so the API and
// the recurring-billing job apply the same guarded transitions.
export {
  SUBSCRIPTION_TRANSITIONS,
  LIVE_SUBSCRIPTION_STATUSES,
  TERMINAL_SUBSCRIPTION_STATUSES,
  ENTITLED_SUBSCRIPTION_STATUSES,
  isLiveStatus,
  isTerminalStatus,
  isEntitledStatus,
  canApplyEvent,
  nextStatus,
  availableEvents,
  applyEvent,
  InvalidSubscriptionTransitionError,
  type SubscriptionEvent,
} from './prisma/subscription-state-machine';

// Subscription billing-period arithmetic (T5.3 / T5.6). The pure calendar-correct
// rule for advancing a paid period by one interval, plus the free-trial period, are
// re-exported so enrolment computes the first (or trial) period and the
// recurring-billing job (T5.4) advances it identically.
export {
  addInterval,
  initialBillingPeriod,
  trialBillingPeriod,
} from './prisma/subscription-period';

// Recurring-billing decision rule (T5.4 / T5.5). The pure classification of a due
// subscription into charge / cancel / expire / skip — including the dunning retry
// ladder — re-exported so the renewal job's service branches on one policy instead
// of re-deriving the retry/cadence rules inline.
export {
  DEFAULT_RENEWAL_RETRY_OFFSET_DAYS,
  classifyDueSubscription,
  type BillableSubscription,
  type ClassifyDueOptions,
  type RenewalAction,
} from './prisma/subscription-billing';

// Invoice description wording (T5.9), re-exported so the enrolment and renewal mint
// sites phrase a charge identically. The reference rule itself lives in `@fit/types`
// (`formatInvoiceNumber`), beside the Settings → Invoicing schema that composes it.
export { subscriptionInvoiceDescription } from './prisma/invoice-number';

// Credit-pack expiry job (T8.5). The pure set-based UPDATE that flips lapsed credit
// packs to `EXPIRED`, re-exported so the API / a scheduled runner share one pass.
export {
  expireCreditPacks,
  type ExpireCreditPacksPrisma,
  type ExpireCreditPacksOptions,
  type ExpireCreditPacksResult,
} from './prisma/expire-credit-packs';

// Subscription freeze/pause policy (T8.4). The pure allowance + compensation rules
// the freeze flow composes with the state machine above, re-exported so the API
// service and the recurring-billing job share one policy.
export {
  MS_PER_DAY,
  DEFAULT_FREEZE_DAYS_PER_PERIOD,
  evaluateFreezeAllowance,
  addDays,
  freezeUntil,
  resumeExtensionDays,
  type FreezeAllowance,
} from './prisma/subscription-freeze-policy';
