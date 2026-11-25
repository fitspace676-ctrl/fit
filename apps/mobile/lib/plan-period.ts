// @fit/mobile — a membership plan's period as a price suffix.
//
// One rule for the join funnel's product rows and the change-plan sheet, so a
// ten-day plan or a one-time pass reads the same in both.

import type { MessageKey } from './i18n/keys';

/** What a plan's price buys: `intervalCount` × `interval`, renewing unless `oneTime`. */
export interface PlanPeriod {
  readonly interval: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  readonly intervalCount: number;
  readonly oneTime: boolean;
}

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/** `/ mo`, `/ 3 mo`, `/ 10 days`; a one-time plan reads `· One-time · 1 day`. */
export function planPeriodSuffix(period: PlanPeriod, t: Translate): string {
  const count = period.intervalCount;
  if (period.oneTime) {
    const length = t(`common.planPeriod.length.${period.interval}`, { count });
    return `· ${t('common.planPeriod.oneTime')} · ${length}`;
  }
  return t(`common.planPeriod.per.${period.interval}`, { count });
}
