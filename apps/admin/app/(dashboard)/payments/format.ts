// @fit/admin — shared money + cadence formatting for the subscription-plans UI.
//
// One place the roster, detail page, and form agree on how a `priceAmount` (an
// integer in the currency's MINOR units, e.g. cents/tetri) maps to and from the
// human-readable major-unit value the staff member sees and types, plus the
// labels for the renewal cadence, so the admin surfaces never drift on the
// money/plan format. Mirrors the package-plans `format.ts` (T4.11) minus the
// one-off cadence and session count — a recurring membership has neither.

import type { useTranslations } from 'next-intl';
import type { SubscriptionInterval } from '@fit/types';
import { createNumberFormat, defaultLocale } from '@fit/i18n';

type T = ReturnType<typeof useTranslations>;

/** Assumed minor units per major unit (USD/EUR/GEL — all two-decimal). */
const MINOR_PER_MAJOR = 100;

/**
 * Format a minor-unit amount as a localized currency string, e.g. `$50.00`.
 *
 * `locale` defaults to the platform's rather than the RUNTIME's: this used to pass
 * `undefined`, which formats in whatever locale the host happens to prefer — the
 * server's in Node and the viewer's OS setting in the browser, which is both
 * non-deterministic and a hydration mismatch waiting to happen.
 *
 * An unknown currency code renders as the code itself, the way CLDR does it, so
 * there is no throwing path left to catch.
 */
export function formatPrice(
  amountMinor: number,
  currency: string,
  locale: string = defaultLocale,
): string {
  return createNumberFormat(locale, { style: 'currency', currency }).format(
    amountMinor / MINOR_PER_MAJOR,
  );
}

/**
 * Render a minor-unit amount as the plain major-unit string a number input shows,
 * e.g. `5000` → `50.00`. An empty/`null` value renders as an empty string.
 */
export function minorToInput(amountMinor: number | null): string {
  if (amountMinor === null || Number.isNaN(amountMinor)) {
    return '';
  }
  return (amountMinor / MINOR_PER_MAJOR).toFixed(2);
}

/**
 * Parse a major-unit input string (e.g. `50`) to an integer minor-unit amount
 * (`5000`). A blank or unparseable string yields `0`, so the price always has a
 * concrete value the API can store.
 */
export function inputToMinor(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 0;
  }
  const major = Number(trimmed);
  if (Number.isNaN(major)) {
    return 0;
  }
  return Math.round(major * MINOR_PER_MAJOR);
}

/** What a plan's price buys: `intervalCount` × `interval`, renewing unless `oneTime`. */
export interface PlanPeriod {
  interval: SubscriptionInterval;
  intervalCount: number;
  oneTime?: boolean;
}

/**
 * Translator for the shared `common.planPeriod` namespace — `per.<UNIT>`,
 * `length.<UNIT>` (both plural on `count`) and `oneTime`.
 */
type PeriodT = (key: string, values?: Record<string, number>) => string;

/** Hand `useTranslations('common.planPeriod')` to the helpers below. */
export function asPeriodT(t: unknown): PeriodT {
  return t as PeriodT;
}

/** The period spelled out: `1 month`, `10 days`; a one-time plan says so. */
export function periodLabel(period: PlanPeriod, t: PeriodT): string {
  const length = t(`length.${period.interval}`, { count: period.intervalCount });
  return period.oneTime ? `${t('oneTime')} · ${length}` : length;
}

/** The short price suffix: `/ mo`, `/ 3 mo`, `/ 10 days`; a one-time plan reads `· One-time · 1 day`. */
export function periodSuffix(period: PlanPeriod, t: PeriodT): string {
  return period.oneTime
    ? `· ${periodLabel(period, t)}`
    : t(`per.${period.interval}`, { count: period.intervalCount });
}

/**
 * The duration choices the plan form offers. `ONE_TIME` is not a unit: it is a
 * plan counted in days that does not renew.
 */
export const PLAN_PERIOD_KINDS = ['ONE_TIME', 'DAY', 'WEEK', 'MONTH', 'YEAR'] as const;
export type PlanPeriodKind = (typeof PLAN_PERIOD_KINDS)[number];

/** The form's duration choice for a stored plan. */
export function periodKindOf(period: PlanPeriod): PlanPeriodKind {
  return period.oneTime ? 'ONE_TIME' : period.interval;
}

/** The unit a duration choice is stored as. */
export function unitOfKind(kind: PlanPeriodKind): SubscriptionInterval {
  return kind === 'ONE_TIME' ? 'DAY' : kind;
}

/**
 * Describe a plan's class-credit allowance the way the plan card / preview reads
 * it: `0` credits is an *unlimited* recurring membership, a finite value is that
 * many classes per period. Mirrors the formacore `billing-plan-edit` preview
 * (`0 = unlimited classes`).
 */
export function creditsLabel(
  includedCredits: number,
  t: T,
  locale: string = defaultLocale,
): string {
  return includedCredits <= 0
    ? t('creditsUnlimited')
    : t('creditsPerPeriod', { count: createNumberFormat(locale).format(includedCredits) });
}
