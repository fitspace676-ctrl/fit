import type { GymLanguage } from '@fit/types';

/**
 * A minor-unit amount as the gym's own currency, in its own language.
 *
 * Shared by every pipeline that puts a price in front of a member, so the same
 * plan never reads two ways: the automation resolver
 * (`automation/automation-merge.service.ts`) and the member email drawer's
 * resolver (`members/member-merge-values.ts`) both expand `{{payment_amount}}`
 * through this one function.
 *
 * Falls back to the bare major-unit number if the locale or currency code is one
 * `Intl` rejects — a price that reads `120` is recoverable; an email that failed
 * to send because a settings typo threw is not.
 */
export function money(minorUnits: number, language: GymLanguage, currency: string): string {
  const major = minorUnits / 100;
  try {
    return new Intl.NumberFormat(language, { style: 'currency', currency }).format(major);
  } catch {
    return String(major);
  }
}
