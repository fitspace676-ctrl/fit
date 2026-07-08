import type {
  AutomationActionType,
  AutomationTriggerCategory,
  AutomationTriggerType,
} from '@fit/types';
import { AUTOMATION_TRIGGER_CATALOG } from '@fit/types';
import type { IconName } from '@/components/ui';
import type { Tone } from '@/components/ui';

/** The category order the trigger picker groups triggers into. */
export const TRIGGER_CATEGORY_ORDER: readonly AutomationTriggerCategory[] = [
  'Members',
  'CRM/Leads',
  'Classes',
  'Payments',
  'POS',
  'Staff',
];

/** i18n key suffix for a trigger category (dots aren't valid message keys). */
export const CATEGORY_KEY: Record<AutomationTriggerCategory, string> = {
  Members: 'members',
  'CRM/Leads': 'leads',
  Classes: 'classes',
  Payments: 'payments',
  POS: 'pos',
  Staff: 'staff',
};

/** Badge tone per category, so the list reads at a glance. */
export const CATEGORY_TONES: Record<AutomationTriggerCategory, Tone> = {
  Members: 'accent',
  'CRM/Leads': 'iris',
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

// ---------------------------------------------------------------------------
// Merge variables — the tokens the message editor can insert. Ported from the
// gym-admin prototype's variable palette; the executor fills them in at send.
// Grouped so the editor can render category headers.
// ---------------------------------------------------------------------------

/** One insertable merge field: the raw token and the i18n key for its label. */
export interface MergeVariable {
  token: string;
  key: string;
}

/** A named group of merge variables shown together in the editor. */
export interface MergeVariableGroup {
  category: string;
  variables: readonly MergeVariable[];
}

/** The merge-variable palette, grouped by the entity the tokens resolve against. */
export const MERGE_VARIABLE_GROUPS: readonly MergeVariableGroup[] = [
  {
    category: 'member',
    variables: [
      { token: '{{member_first_name}}', key: 'memberFirstName' },
      { token: '{{member_last_name}}', key: 'memberLastName' },
      { token: '{{member_email}}', key: 'memberEmail' },
      { token: '{{member_phone}}', key: 'memberPhone' },
      { token: '{{member_plan_name}}', key: 'memberPlanName' },
      { token: '{{member_expiry_date}}', key: 'memberExpiryDate' },
      { token: '{{member_checkin_count}}', key: 'memberCheckinCount' },
      { token: '{{member_points_balance}}', key: 'memberPointsBalance' },
      { token: '{{member_location}}', key: 'memberLocation' },
    ],
  },
  {
    category: 'lead',
    variables: [
      { token: '{{lead_first_name}}', key: 'leadFirstName' },
      { token: '{{lead_last_name}}', key: 'leadLastName' },
      { token: '{{lead_source}}', key: 'leadSource' },
      { token: '{{lead_stage}}', key: 'leadStage' },
      { token: '{{lead_assigned_to}}', key: 'leadAssignedTo' },
      { token: '{{lead_last_contact_date}}', key: 'leadLastContactDate' },
    ],
  },
  {
    category: 'class',
    variables: [
      { token: '{{class_name}}', key: 'className' },
      { token: '{{class_date}}', key: 'classDate' },
      { token: '{{class_time}}', key: 'classTime' },
      { token: '{{class_trainer_name}}', key: 'classTrainerName' },
      { token: '{{class_location}}', key: 'classLocation' },
    ],
  },
  {
    category: 'payment',
    variables: [
      { token: '{{payment_amount}}', key: 'paymentAmount' },
      { token: '{{payment_due_date}}', key: 'paymentDueDate' },
      { token: '{{payment_plan_name}}', key: 'paymentPlanName' },
      { token: '{{payment_invoice_number}}', key: 'paymentInvoiceNumber' },
    ],
  },
  {
    category: 'business',
    variables: [
      { token: '{{business_name}}', key: 'businessName' },
      { token: '{{business_location_name}}', key: 'businessLocationName' },
      { token: '{{business_phone}}', key: 'businessPhone' },
      { token: '{{business_address}}', key: 'businessAddress' },
    ],
  },
];

/** Format an ISO timestamp as a short localized date, or an em dash when absent. */
export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}
