// @fit/admin — audit-log action keys → i18n label lookups (T3.10, was T4.9).
//
// Shared by the audit tab's filter select and its table cell so the two never
// drift. Each known action key (`@fit/types` AUDIT_ACTIONS) maps to a stable i18n
// sub-key under `admin.activity.audit.actions.*`; the components resolve the label
// through their translator. A key with no mapping (a newly-added action not yet
// labelled) falls back to the raw action string via {@link auditActionLabelKey},
// so the viewer never hides an entry.

import { AUDIT_ACTIONS, type AuditAction } from '@fit/types';

/** i18n sub-key (under `admin.activity.audit.actions`) per known action key. */
const ACTION_LABEL_KEYS: Record<AuditAction, string> = {
  'gym.impersonate': 'impersonate',
  'gym.status.update': 'statusUpdate',
};

/** The known actions as `{ value, labelKey }` options for the filter select. */
export const ACTION_OPTIONS: ReadonlyArray<{ value: AuditAction; labelKey: string }> =
  AUDIT_ACTIONS.map((value) => ({ value, labelKey: ACTION_LABEL_KEYS[value] }));

/** The i18n sub-key for an action, or `null` when unlabelled (render raw key). */
export function auditActionLabelKey(action: string): string | null {
  return (ACTION_LABEL_KEYS as Record<string, string>)[action] ?? null;
}
