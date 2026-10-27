import {
  AUTOMATION_TRIGGER_CATALOG,
  type AutomationEntityType,
  type AutomationTriggerType,
} from './automation';

export const AUTOMATION_MERGE_GROUPS = [
  'member',
  'membership',
  'class',
  'session',
  'invoice',
  'order',
  'business',
] as const;
export type AutomationMergeGroup = (typeof AUTOMATION_MERGE_GROUPS)[number];
export interface AutomationMergeField {
  key: string;
  token: string;
  group: AutomationMergeGroup;
  contexts: readonly AutomationEntityType[];
}
const ALL_CONTEXTS: readonly AutomationEntityType[] = [
  'member',
  'subscription',
  'booking',
  'invoice',
  'order',
  'service_session',
];

export const AUTOMATION_MERGE_FIELDS: readonly AutomationMergeField[] = [
  // -- The person --
  {
    key: 'memberFirstName',
    token: '{{member_first_name}}',
    group: 'member',
    contexts: ALL_CONTEXTS,
  },
  { key: 'memberLastName', token: '{{member_last_name}}', group: 'member', contexts: ALL_CONTEXTS },
  { key: 'memberFullName', token: '{{member_full_name}}', group: 'member', contexts: ALL_CONTEXTS },
  { key: 'memberEmail', token: '{{member_email}}', group: 'member', contexts: ALL_CONTEXTS },
  { key: 'memberPhone', token: '{{member_phone}}', group: 'member', contexts: ALL_CONTEXTS },
  { key: 'memberStatus', token: '{{member_status}}', group: 'member', contexts: ALL_CONTEXTS },
  { key: 'memberJoinDate', token: '{{member_join_date}}', group: 'member', contexts: ALL_CONTEXTS },
  { key: 'memberBirthday', token: '{{member_birthday}}', group: 'member', contexts: ALL_CONTEXTS },
  {
    key: 'memberCheckinCount',
    token: '{{member_checkin_count}}',
    group: 'member',
    contexts: ALL_CONTEXTS,
  },
  {
    key: 'memberPointsBalance',
    token: '{{member_points_balance}}',
    group: 'member',
    contexts: ALL_CONTEXTS,
  },
  // -- Their membership --
  {
    key: 'membershipPlanName',
    token: '{{member_plan_name}}',
    group: 'membership',
    contexts: ALL_CONTEXTS,
  },
  {
    key: 'membershipExpiryDate',
    token: '{{member_expiry_date}}',
    group: 'membership',
    contexts: ALL_CONTEXTS,
  },
  {
    key: 'membershipDaysLeft',
    token: '{{member_days_until_expiry}}',
    group: 'membership',
    contexts: ALL_CONTEXTS,
  },
  {
    key: 'membershipPrice',
    token: '{{payment_amount}}',
    group: 'membership',
    contexts: ALL_CONTEXTS,
  },
  {
    key: 'membershipRenewalDate',
    token: '{{payment_due_date}}',
    group: 'membership',
    contexts: ALL_CONTEXTS,
  },
  // -- The gym --
  { key: 'businessName', token: '{{business_name}}', group: 'business', contexts: ALL_CONTEXTS },
  { key: 'businessPhone', token: '{{business_phone}}', group: 'business', contexts: ALL_CONTEXTS },
  {
    key: 'businessAddress',
    token: '{{business_address}}',
    group: 'business',
    contexts: ALL_CONTEXTS,
  },
  { key: 'businessEmail', token: '{{business_email}}', group: 'business', contexts: ALL_CONTEXTS },
  {
    key: 'businessWebsite',
    token: '{{business_website}}',
    group: 'business',
    contexts: ALL_CONTEXTS,
  },
  { key: 'memberGender', token: '{{member_gender}}', group: 'member', contexts: ALL_CONTEXTS },
  { key: 'memberAge', token: '{{member_age}}', group: 'member', contexts: ALL_CONTEXTS },
  { key: 'memberTags', token: '{{member_tags}}', group: 'member', contexts: ALL_CONTEXTS },
  {
    key: 'memberBranchName',
    token: '{{member_branch_name}}',
    group: 'member',
    contexts: ALL_CONTEXTS,
  },
  {
    key: 'memberBranchAddress',
    token: '{{member_branch_address}}',
    group: 'member',
    contexts: ALL_CONTEXTS,
  },
  {
    key: 'memberBranchPhone',
    token: '{{member_branch_phone}}',
    group: 'member',
    contexts: ALL_CONTEXTS,
  },
  {
    key: 'memberLastCheckinDate',
    token: '{{member_last_checkin_date}}',
    group: 'member',
    contexts: ALL_CONTEXTS,
  },
  {
    key: 'memberPlanPrice',
    token: '{{member_plan_price}}',
    group: 'membership',
    contexts: ALL_CONTEXTS,
  },
  {
    key: 'memberSubscriptionStatus',
    token: '{{member_subscription_status}}',
    group: 'membership',
    contexts: ALL_CONTEXTS,
  },
  {
    key: 'memberPeriodStart',
    token: '{{member_period_start}}',
    group: 'membership',
    contexts: ALL_CONTEXTS,
  },
  {
    key: 'memberFrozenUntil',
    token: '{{member_frozen_until}}',
    group: 'membership',
    contexts: ALL_CONTEXTS,
  },
  { key: 'className', token: '{{class_name}}', group: 'class', contexts: ['booking'] },
  { key: 'classDate', token: '{{class_date}}', group: 'class', contexts: ['booking'] },
  { key: 'classTime', token: '{{class_time}}', group: 'class', contexts: ['booking'] },
  {
    key: 'classTrainerName',
    token: '{{class_trainer_name}}',
    group: 'class',
    contexts: ['booking'],
  },
  { key: 'classLocation', token: '{{class_location}}', group: 'class', contexts: ['booking'] },
  { key: 'invoiceNumber', token: '{{invoice_number}}', group: 'invoice', contexts: ['invoice'] },
  { key: 'invoiceAmount', token: '{{invoice_amount}}', group: 'invoice', contexts: ['invoice'] },
  { key: 'invoiceDate', token: '{{invoice_date}}', group: 'invoice', contexts: ['invoice'] },
  { key: 'orderTotal', token: '{{order_total}}', group: 'order', contexts: ['order'] },
  { key: 'orderItems', token: '{{order_items}}', group: 'order', contexts: ['order'] },
  {
    key: 'sessionName',
    token: '{{session_name}}',
    group: 'session',
    contexts: ['service_session'],
  },
  {
    key: 'sessionDate',
    token: '{{session_date}}',
    group: 'session',
    contexts: ['service_session'],
  },
  {
    key: 'sessionTime',
    token: '{{session_time}}',
    group: 'session',
    contexts: ['service_session'],
  },
  {
    key: 'sessionTrainerName',
    token: '{{session_trainer_name}}',
    group: 'session',
    contexts: ['service_session'],
  },
];

/** Historical tokens remain known so interpolation blanks missing values. */
export const RETIRED_MERGE_TOKENS: readonly string[] = [
  'member_location',
  'payment_plan_name',
  'payment_invoice_number',
  'business_location_name',
];
export const AUTOMATION_MERGE_KEYS: readonly string[] = [
  ...AUTOMATION_MERGE_FIELDS.map((field) => field.token.replace(/[{}]/g, '')),
  ...RETIRED_MERGE_TOKENS,
];

export function mergeFieldsForTrigger(
  triggerType: AutomationTriggerType,
): readonly AutomationMergeField[] {
  const trigger = AUTOMATION_TRIGGER_CATALOG.find((entry) => entry.value === triggerType);
  return trigger
    ? AUTOMATION_MERGE_FIELDS.filter((field) => field.contexts.includes(trigger.entityType))
    : [];
}
