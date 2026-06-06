// @fit/admin — human labels for the audit-log viewer's action keys (T4.9).
//
// Shared by the filter select and the table cell so the two never drift. The
// labels cover the actions the platform writes today (`@fit/types` AUDIT_ACTIONS);
// an unknown key (a newly-added action not yet labelled here) falls back to the
// raw key via {@link auditActionLabel}, so the viewer never hides an entry.

import { AUDIT_ACTIONS, type AuditAction } from '@fit/types';

/** Human label per known action key. */
const ACTION_LABELS: Record<AuditAction, string> = {
  'gym.impersonate': 'Owner impersonation',
  'gym.status.update': 'Gym status change',
};

/** The known actions as `{ value, label }` options for the filter select. */
export const ACTION_OPTIONS: ReadonlyArray<{ value: AuditAction; label: string }> =
  AUDIT_ACTIONS.map((value) => ({ value, label: ACTION_LABELS[value] }));

/** A human label for an action key, falling back to the raw key when unlabelled. */
export function auditActionLabel(action: string): string {
  return (ACTION_LABELS as Record<string, string>)[action] ?? action;
}
