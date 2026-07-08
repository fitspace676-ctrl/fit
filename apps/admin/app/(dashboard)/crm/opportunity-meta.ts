// @fit/admin — shared CRM opportunity presentation metadata (T12.4).
//
// Pure lookup tables shared by the opportunities roster, the dialogs and the
// opportunity detail page. Labels come from the `admin.crm` i18n namespace
// (`opportunityStatus.<value>` / `opportunityType.<value>`); this module only
// fixes the visual treatment per enum value so every surface renders a given
// status/type the same way. Money/date formatters and the activity lookups are
// reused from `lead-meta`.

import type { OpportunityStatus, OpportunityType } from '@fit/types';
import type { IconName, Tone } from '@/components/ui';

/** Badge tone per opportunity stage — cool for open stages, green won, red lost. */
export const OPPORTUNITY_STATUS_TONES: Record<OpportunityStatus, Tone> = {
  INTERESTED: 'ink',
  PROPOSAL_SENT: 'brand',
  DECISION_PENDING: 'warning',
  WON: 'success',
  LOST: 'danger',
};

/** Icon per opportunity type, mirroring the type badge of the reference board. */
export const OPPORTUNITY_TYPE_ICONS: Record<OpportunityType, IconName> = {
  MEMBERSHIP_UPGRADE: 'award',
  PT_SESSIONS: 'dumbbell',
  SERVICE_PACKAGE: 'bag',
  OTHER: 'tag',
};

/** The stages an opportunity can be moved to directly (closing goes through won/lost). */
export const OPEN_OPPORTUNITY_STATUSES = [
  'INTERESTED',
  'PROPOSAL_SENT',
  'DECISION_PENDING',
] as const;

/** Whether an opportunity is still in play (not WON / LOST). */
export function isOpenOpportunity(status: OpportunityStatus): boolean {
  return status !== 'WON' && status !== 'LOST';
}

/** Whole percent of the deal value that is probability-weighted (`value × prob / 100`). */
export function weightedValue(value: number, probability: number): number {
  return Math.round((value * probability) / 100);
}

/** Initials for the member avatar placeholder, from a resolved display name. */
export function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (a + b).toUpperCase() || '?';
}
