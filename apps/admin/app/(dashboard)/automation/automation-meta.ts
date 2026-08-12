import type {
  AutomationActionType,
  AutomationTriggerCategory,
  AutomationTriggerType,
} from '@fit/types';
import { AUTOMATION_TRIGGER_CATALOG } from '@fit/types';
import type { IconName } from '@/components/ui';
import type { Tone } from '@/components/ui';
import { createDateTimeFormat } from '@fit/i18n';

/** The category order the trigger picker groups triggers into. */
export const TRIGGER_CATEGORY_ORDER: readonly AutomationTriggerCategory[] = [
  'Members',
  'Classes',
  'Payments',
  'POS',
  'Staff',
];

/** i18n key suffix for a trigger category (dots aren't valid message keys). */
export const CATEGORY_KEY: Record<AutomationTriggerCategory, string> = {
  Members: 'members',
  Classes: 'classes',
  Payments: 'payments',
  POS: 'pos',
  Staff: 'staff',
};

/** Badge tone per category, so the list reads at a glance. */
export const CATEGORY_TONES: Record<AutomationTriggerCategory, Tone> = {
  Members: 'accent',
  Classes: 'success',
  Payments: 'warning',
  POS: 'ink',
  Staff: 'flame',
};

/** The four action types, in the order the builder lists them. */
export const ACTION_ORDER: readonly AutomationActionType[] = [
  'push_notification',
  'email',
  'sms',
  'create_task',
];

/** Icon per action type — mirrors the reference's Bell / Mail / MessageSquare / Clipboard. */
export const ACTION_ICONS: Record<AutomationActionType, IconName> = {
  push_notification: 'bell',
  email: 'mail',
  sms: 'message',
  create_task: 'check',
};

/** The catalog entry for one trigger (label, category, needsDays, daysLabel). */
export const TRIGGER_META = new Map(AUTOMATION_TRIGGER_CATALOG.map((t) => [t.value, t]));

/** Lookup a trigger's category (defaults to Members if somehow unknown). */
export function triggerCategory(trigger: AutomationTriggerType): AutomationTriggerCategory {
  return TRIGGER_META.get(trigger)?.category ?? 'Members';
}

/** Whether the trigger requires a numeric `triggerConfig.days`. */
export function triggerNeedsDays(trigger: AutomationTriggerType): boolean {
  return TRIGGER_META.get(trigger)?.needsDays ?? false;
}

// The merge-field catalogue now lives in `@fit/types`
// (`AUTOMATION_MERGE_FIELDS`), shared with the Settings screen that curates it
// and the executor's resolver that fills the tokens.

/** Format an ISO timestamp as a short localized date, or an em dash when absent. */
export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return createDateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}
