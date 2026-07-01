// @fit/admin — shared formatting + option lists for the class-templates UI.
//
// One place the roster, detail page, and form agree on how a class template's
// duration, validity window, and lifecycle status render, plus the option lists
// the recurrence editor and the status select offer — so the admin surfaces never
// drift on the display format.

import type { ClassTemplateStatus, RecurrenceFreq, RecurrenceWeekday } from '@fit/types';
import type { Tone } from '@/components/ui';

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
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Render a `YYYY-MM-DD` validity date as a short local date, or an em dash when absent. */
export function formatDate(date: string | null): string {
  if (!date) return '—';
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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

/** The selectable recurrence frequencies and their human labels, in display order. */
export const FREQ_OPTIONS: ReadonlyArray<{ value: RecurrenceFreq; label: string; noun: string }> = [
  { value: 'DAILY', label: 'Daily', noun: 'day' },
  { value: 'WEEKLY', label: 'Weekly', noun: 'week' },
  { value: 'MONTHLY', label: 'Monthly', noun: 'month' },
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

/** The singular noun for a frequency, for "every N ___s" copy. */
export function freqNoun(freq: RecurrenceFreq): string {
  return FREQ_OPTIONS.find((option) => option.value === freq)?.noun ?? freq.toLowerCase();
}
