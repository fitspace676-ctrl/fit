// @fit/admin — shared formatting + option lists for the class-templates UI.
//
// One place the roster, detail page, and form agree on how a class template's
// duration, validity window, and lifecycle status render, plus the option lists
// the recurrence editor and the status select offer — so the admin surfaces never
// drift on the display format.

import type {
  AdminClassTemplateRow,
  ClassTemplateStatus,
  RecurrenceFreq,
  RecurrenceWeekday,
} from '@fit/types';
import type { Tone } from '@/components/ui';
import { createDateTimeFormat, defaultLocale } from '@fit/i18n';

/** Visual treatment per template status — success active, warning paused. */
export const STATUS_STYLES: Record<ClassTemplateStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  PAUSED: { label: 'Paused', tone: 'warning' },
};

/** Render an ISO instant as a short local date, or an em dash when absent. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : createDateTimeFormat(defaultLocale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);
}

/** Render a `YYYY-MM-DD` validity date as a short local date, or an em dash when absent. */
export function formatDate(date: string | null): string {
  if (!date) return '—';
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : createDateTimeFormat(defaultLocale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(parsed);
}

/** Render a duration in minutes as a compact `1h 30m` / `45m` label. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * A compact pricing label for the roster: "Free", "Included (N)" with the plan
 * count, or "Paid · 15.00" with the per-session price in major units. Mirrors the
 * reference admin's Pricing column.
 */
export function formatPricing(
  template: Pick<AdminClassTemplateRow, 'pricingRule' | 'priceMinor' | 'includedPlanIds'>,
): string {
  switch (template.pricingRule) {
    case 'INCLUDED':
      return `Included (${template.includedPlanIds.length})`;
    case 'PAID':
      return template.priceMinor === null
        ? 'Paid'
        : `Paid · ${(template.priceMinor / 100).toFixed(2)}`;
    case 'FREE':
    default:
      return 'Free';
  }
}

/** The selectable recurrence frequencies and their human labels, in display order. */
export const FREQ_OPTIONS: ReadonlyArray<{ value: RecurrenceFreq; label: string }> = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
];

/** The weekday toggles the editor renders, Monday-first with short labels. */
export const WEEKDAY_OPTIONS: ReadonlyArray<{ value: RecurrenceWeekday; label: string }> = [
  { value: 'MO', label: 'Mon' },
  { value: 'TU', label: 'Tue' },
  { value: 'WE', label: 'Wed' },
  { value: 'TH', label: 'Thu' },
  { value: 'FR', label: 'Fri' },
  { value: 'SA', label: 'Sat' },
  { value: 'SU', label: 'Sun' },
];
