// @fit/admin — shared CRM lead presentation metadata (T12.3).
//
// Pure lookup tables + formatters shared by the leads roster, the dialogs and
// the lead detail page. Labels themselves come from the `admin.crm` i18n
// namespace (`status.<value>` / `source.<value>` / `activityType.<value>`);
// this module only fixes the visual treatment per enum value so every surface
// renders a given status/source/activity the same way.

import type { CrmActivityType, LeadSource, LeadStatus } from '@fit/types';
import type { IconName, Tone } from '@/components/ui';

/** Badge tone per lead stage — cool for open stages, green won, red lost. */
export const LEAD_STATUS_TONES: Record<LeadStatus, Tone> = {
  NEW: 'ink',
  CONTACTED: 'brand',
  TRIAL: 'warning',
  CONVERTED: 'success',
  LOST: 'danger',
};

/** Icon per lead source, mirroring the source badge of the reference board. */
export const LEAD_SOURCE_ICONS: Record<LeadSource, IconName> = {
  WALK_IN: 'user',
  INSTAGRAM: 'camera',
  REFERRAL: 'users',
  WEBSITE: 'grid',
};

/** Icon per activity type for the timeline / recent-activity feeds. */
export const ACTIVITY_ICONS: Record<CrmActivityType, IconName> = {
  CALL: 'phone',
  EMAIL: 'mail',
  WHATSAPP: 'message',
  MEETING: 'users',
  NOTE: 'tag',
  TASK_COMPLETED: 'check',
};

/** Accent CSS variable per activity type (timeline icon tint). */
export const ACTIVITY_COLORS: Record<CrmActivityType, string> = {
  CALL: 'var(--color-success)',
  EMAIL: 'var(--color-warning)',
  WHATSAPP: 'var(--color-info)',
  MEETING: 'var(--color-accent)',
  NOTE: 'var(--color-text-accent)',
  TASK_COMPLETED: 'var(--color-success)',
};

/** The stages a lead can be moved to directly (closing goes through won/lost). */
export const OPEN_LEAD_STATUSES = ['NEW', 'CONTACTED', 'TRIAL'] as const;

/** Whether a lead is still in play (not CONVERTED / LOST). */
export function isOpenLead(status: LeadStatus): boolean {
  return status !== 'CONVERTED' && status !== 'LOST';
}

/**
 * Format a MINOR-unit amount in the gym's currency. CRM money is stored in
 * tetri (matching `Product.priceAmount`) with no per-row currency, so this
 * renders the platform default lari symbol.
 */
export function formatMoney(minorUnits: number): string {
  return `₾${(minorUnits / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/** Render an ISO instant as a short local date, or an em dash when absent. */
export function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Render an ISO instant as a short local date-time, or an em dash when absent. */
export function formatDateTime(iso: string | null, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

/** Whole days a lead has been in the pipeline since capture (minimum 0). */
export function daysInPipeline(createdAtIso: string): number {
  const created = new Date(createdAtIso).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
}

/** Whether a follow-up date is in the past (compared at local midnight). */
export function isFollowUpOverdue(followUpIso: string | null): boolean {
  if (!followUpIso) return false;
  const due = new Date(followUpIso);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

/** A `YYYY-MM-DD` date-input value from an ISO instant (empty when absent). */
export function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** An ISO datetime (UTC midnight) from a `YYYY-MM-DD` date-input value, or null. */
export function fromDateInputValue(value: string): string | null {
  return value ? `${value}T00:00:00.000Z` : null;
}

/** Initials for the lead avatar placeholder. */
export function leadInitials(firstName: string, lastName: string): string {
  const a = firstName.trim()[0] ?? '';
  const b = lastName.trim()[0] ?? '';
  return (a + b).toUpperCase() || '?';
}
