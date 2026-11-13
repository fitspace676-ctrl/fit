// @fit/admin — shared formatting + option lists for the class-templates UI.
//
// One place the roster, detail page, and form agree on how a class template's
// duration, validity window, and lifecycle status render, plus the option lists
// the recurrence editor and the status select offer — so the admin surfaces never
// drift on the display format.

import type { useTranslations } from 'next-intl';
import type {
  AdminClassTemplateRow,
  ClassTemplateStatus,
  RecurrenceFreq,
  RecurrenceWeekday,
} from '@fit/types';
import type { BadgeTone } from '@fit/ui-kit';
import { createDateTimeFormat, createNumberFormat, defaultLocale } from '@fit/i18n';

type T = ReturnType<typeof useTranslations>;

/** Visual treatment per template status — success active, warning paused. */
export const STATUS_STYLES: Record<
  ClassTemplateStatus,
  { labelKey: `status.${ClassTemplateStatus}`; tone: BadgeTone }
> = {
  ACTIVE: { labelKey: 'status.ACTIVE', tone: 'positive' },
  PAUSED: { labelKey: 'status.PAUSED', tone: 'pending' },
};

function formatShortDate(date: Date, locale: string): string {
  return createDateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/** Render an ISO instant as a short local date, or `-` when absent. */
export function formatDateTime(iso: string | null, locale: string = defaultLocale): string {
  if (!iso) return '-';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '-' : formatShortDate(date, locale);
}

/** Render a `YYYY-MM-DD` validity date as a short local date, or `-` when absent. */
export function formatDate(date: string | null, locale: string = defaultLocale): string {
  if (!date) return '-';
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : formatShortDate(parsed, locale);
}

/** Render a duration in minutes using locale-aware units (e.g. `1h 15m` / `1 სთ 15 წთ`). */
export function formatDuration(minutes: number, t: T, locale: string = defaultLocale): string {
  const nf = createNumberFormat(locale);
  if (minutes < 60) {
    return t('duration.minutesOnly', { minutes: nf.format(minutes) });
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? t('duration.hoursOnly', { hours: nf.format(hours) })
    : t('duration.hoursMinutes', {
        hours: nf.format(hours),
        minutes: nf.format(rest),
      });
}

/**
 * A compact pricing label for the roster, localized and number-formatted:
 * e.g. "Free" / "უფასო", "Included (N)" / "პაკეტში (N)", or "Paid · 15.00" / "ფასიანი · 15,00".
 */
export function formatPricing(
  template: Pick<AdminClassTemplateRow, 'pricingRule' | 'priceMinor' | 'includedPlanIds'>,
  t: T,
  locale: string = defaultLocale,
): string {
  switch (template.pricingRule) {
    case 'INCLUDED':
      return t('pricing.includedCount', {
        count: createNumberFormat(locale).format(template.includedPlanIds.length),
      });
    case 'PAID':
      return template.priceMinor === null
        ? t('pricing.paid')
        : t('pricing.paidAmount', {
            amount: createNumberFormat(locale, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(template.priceMinor / 100),
          });
    case 'FREE':
    default:
      return t('pricing.free');
  }
}

/** The selectable recurrence frequencies and their translation keys, in display order. */
export const FREQ_OPTIONS: ReadonlyArray<{
  value: RecurrenceFreq;
  labelKey: `recurrence.freq.${RecurrenceFreq}`;
}> = [
  { value: 'ONCE', labelKey: 'recurrence.freq.ONCE' },
  { value: 'DAILY', labelKey: 'recurrence.freq.DAILY' },
  { value: 'WEEKLY', labelKey: 'recurrence.freq.WEEKLY' },
];

/** The weekday toggles the editor renders, Monday-first with translation keys. */
export const WEEKDAY_OPTIONS: ReadonlyArray<{
  value: RecurrenceWeekday;
  labelKey: `recurrence.weekday.${RecurrenceWeekday}`;
}> = [
  { value: 'MO', labelKey: 'recurrence.weekday.MO' },
  { value: 'TU', labelKey: 'recurrence.weekday.TU' },
  { value: 'WE', labelKey: 'recurrence.weekday.WE' },
  { value: 'TH', labelKey: 'recurrence.weekday.TH' },
  { value: 'FR', labelKey: 'recurrence.weekday.FR' },
  { value: 'SA', labelKey: 'recurrence.weekday.SA' },
  { value: 'SU', labelKey: 'recurrence.weekday.SU' },
];
