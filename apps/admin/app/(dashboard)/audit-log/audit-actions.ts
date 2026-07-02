// @fit/admin — human labels for the audit-log viewer's action keys (T4.9).
//
// Shared by the filter chips and the table cell so the two never drift. The
// labels cover the actions the platform writes today (`@fit/types` AUDIT_ACTIONS);
// an unknown key (a newly-added action not yet labelled here) falls back to the
// raw key via {@link auditActionLabel}, so the viewer never hides an entry.

import { AUDIT_ACTIONS, type AuditAction } from '@fit/types';

/** Human label per known action key. */
const ACTION_LABELS: Record<AuditAction, string> = {
  'gym.impersonate': 'Owner impersonation',
  'gym.status.update': 'Gym status change',
};

/**
 * Category-dot colour per known action, mirroring the reference table's per-
 * category dots (staff-identity actions → iris, status/suspension → warning).
 * An unknown action gets the neutral ink dot so new keys still render.
 */
const ACTION_DOTS: Record<AuditAction, string> = {
  'gym.impersonate': 'bg-iris-400',
  'gym.status.update': 'bg-warning-400',
};

/** The known actions as `{ value, label }` options for the filter chips. */
export const ACTION_OPTIONS: ReadonlyArray<{ value: AuditAction; label: string }> =
  AUDIT_ACTIONS.map((value) => ({ value, label: ACTION_LABELS[value] }));

/** A human label for an action key, falling back to the raw key when unlabelled. */
export function auditActionLabel(action: string): string {
  return (ACTION_LABELS as Record<string, string>)[action] ?? action;
}

/** The category-dot background class for an action key. */
export function auditActionDot(action: string): string {
  return (ACTION_DOTS as Record<string, string>)[action] ?? 'bg-ink-400';
}
