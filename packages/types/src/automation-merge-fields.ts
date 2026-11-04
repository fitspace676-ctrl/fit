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
  'offer',
  'staff',
  'business',
] as const;
export type AutomationMergeGroup = (typeof AUTOMATION_MERGE_GROUPS)[number];
export interface AutomationMergeField {
  key: string;
  token: string;
  group: AutomationMergeGroup;
  contexts: readonly AutomationEntityType[];
  /**
   * Older token names for the same value. They still interpolate (saved rules
   * keep working) but the builder no longer offers them.
   */
  aliases?: readonly string[];
}
const ALL_CONTEXTS: readonly AutomationEntityType[] = [
  'member',
  'subscription',
  'booking',
  'invoice',
  'order',
  'service_session',
];
const CLASS_OR_SESSION: readonly AutomationEntityType[] = ['booking', 'service_session'];
const INVOICE_OR_ORDER: readonly AutomationEntityType[] = ['invoice', 'order'];

function field(
  key: string,
  name: string,
  group: AutomationMergeGroup,
  contexts: readonly AutomationEntityType[],
  aliases?: readonly string[],
): AutomationMergeField {
  const entry: AutomationMergeField = { key, token: `{{${name}}}`, group, contexts };
  return aliases ? { ...entry, aliases } : entry;
}

export const AUTOMATION_MERGE_FIELDS: readonly AutomationMergeField[] = [
  // -- The person --
  field('memberFirstName', 'first_name', 'member', ALL_CONTEXTS, ['member_first_name']),
  field('memberLastName', 'last_name', 'member', ALL_CONTEXTS, ['member_last_name']),
  field('memberFullName', 'full_name', 'member', ALL_CONTEXTS, ['member_full_name']),
  field('memberEmail', 'email', 'member', ALL_CONTEXTS, ['member_email']),
  field('memberPhone', 'phone', 'member', ALL_CONTEXTS, ['member_phone']),
  field('memberStatus', 'member_status', 'member', ALL_CONTEXTS),
  field('memberJoinDate', 'member_since', 'member', ALL_CONTEXTS, [
    'member_join_date',
    'join_date',
  ]),
  field('memberBirthday', 'member_birthday', 'member', ALL_CONTEXTS, ['birthday']),
  field('memberCheckinCount', 'member_checkin_count', 'member', ALL_CONTEXTS),
  field('memberPointsBalance', 'member_points_balance', 'member', ALL_CONTEXTS),
  field('memberGender', 'member_gender', 'member', ALL_CONTEXTS),
  field('memberAge', 'member_age', 'member', ALL_CONTEXTS),
  field('memberTags', 'member_tags', 'member', ALL_CONTEXTS),
  field('memberBranchName', 'branch_name', 'member', ALL_CONTEXTS, ['member_branch_name']),
  field('memberBranchAddress', 'member_branch_address', 'member', ALL_CONTEXTS),
  field('memberBranchPhone', 'member_branch_phone', 'member', ALL_CONTEXTS),
  field('memberLastCheckinDate', 'last_checkin_date', 'member', ALL_CONTEXTS, [
    'member_last_checkin_date',
  ]),
  field('memberDaysInactive', 'days_inactive', 'member', ALL_CONTEXTS),
  // -- Their membership --
  field('membershipPlanName', 'membership_plan', 'membership', ALL_CONTEXTS, [
    'member_plan_name',
    'plan_name',
  ]),
  field('membershipExpiryDate', 'expiry_date', 'membership', ALL_CONTEXTS, ['member_expiry_date']),
  field('membershipDaysLeft', 'days_remaining', 'membership', ALL_CONTEXTS, [
    'member_days_until_expiry',
    'days_until_expiry',
  ]),
  field('membershipPrice', 'payment_amount', 'membership', ALL_CONTEXTS),
  field('membershipRenewalDate', 'renewal_date', 'membership', ALL_CONTEXTS, ['payment_due_date']),
  field('memberPlanPrice', 'plan_price', 'membership', ALL_CONTEXTS, ['member_plan_price']),
  field('memberSubscriptionStatus', 'member_subscription_status', 'membership', ALL_CONTEXTS),
  field('memberPeriodStart', 'member_period_start', 'membership', ALL_CONTEXTS),
  field('memberFrozenUntil', 'freeze_end_date', 'membership', ALL_CONTEXTS, [
    'member_frozen_until',
  ]),
  field('membershipFreezeStart', 'freeze_start_date', 'membership', ALL_CONTEXTS),
  field('membershipCancellationDate', 'cancellation_date', 'membership', ['subscription']),
  field('membershipCancellationReason', 'cancellation_reason', 'membership', ['subscription']),
  field('membershipAccessEndDate', 'access_end_date', 'membership', ALL_CONTEXTS),
  // -- The class --
  field('className', 'class_name', 'class', ['booking']),
  field('classDate', 'class_date', 'class', ['booking']),
  field('classTime', 'class_time', 'class', ['booking']),
  field('classTrainerName', 'trainer_name', 'class', CLASS_OR_SESSION, [
    'class_trainer_name',
    'session_trainer_name',
  ]),
  field('classLocation', 'location', 'class', CLASS_OR_SESSION, ['class_location']),
  field('classWaitlistPosition', 'waitlist_position', 'class', ['booking']),
  field('classSpotsFilled', 'spots_filled', 'class', ['booking']),
  field('classSpotsTotal', 'spots_total', 'class', ['booking']),
  field('missedClassName', 'missed_class_name', 'class', ['booking']),
  field('missedClassDate', 'missed_class_date', 'class', ['booking']),
  // -- The PT session --
  field('sessionName', 'session_type', 'session', ['service_session'], ['session_name']),
  field('sessionDate', 'session_date', 'session', ['service_session']),
  field('sessionTime', 'session_time', 'session', ['service_session']),
  field('sessionCancelledBy', 'cancelled_by', 'session', ['service_session']),
  // -- The invoice / payment --
  field('invoiceNumber', 'invoice_number', 'invoice', ['invoice']),
  field('invoiceAmount', 'amount', 'invoice', ['invoice'], ['invoice_amount']),
  field('invoiceDate', 'payment_date', 'invoice', ['invoice'], ['invoice_date']),
  field('invoiceDueDate', 'due_date', 'invoice', ['invoice']),
  field('invoicePaymentMethod', 'payment_method', 'invoice', ['invoice']),
  field('invoiceFailureReason', 'failure_reason', 'invoice', ['invoice']),
  field('refundAmount', 'refund_amount', 'invoice', INVOICE_OR_ORDER),
  field('refundDate', 'refund_date', 'invoice', INVOICE_OR_ORDER),
  // -- The order --
  field('orderTotal', 'order_total', 'order', ['order']),
  field('orderItems', 'order_items', 'order', ['order']),
  field('orderProductName', 'product_name', 'order', ['order']),
  field('orderNumber', 'order_number', 'order', ['order']),
  field('orderPurchaseDate', 'purchase_date', 'order', ['order']),
  // -- The rule's offer (from actionConfig.offer) --
  field('offerDiscountPercent', 'discount_percent', 'offer', ALL_CONTEXTS),
  field('offerBonusPoints', 'bonus_points', 'offer', ALL_CONTEXTS),
  field('offerCode', 'offer_code', 'offer', ALL_CONTEXTS),
  field('offerExpiry', 'offer_expiry', 'offer', ALL_CONTEXTS),
  // -- Who gets it, and who it is about --
  field('recipientName', 'recipient_name', 'staff', ALL_CONTEXTS),
  field('relatedMemberName', 'related_member_name', 'staff', ALL_CONTEXTS),
  // -- The gym --
  field('businessName', 'business_name', 'business', ALL_CONTEXTS),
  field('businessPhone', 'business_phone', 'business', ALL_CONTEXTS),
  field('businessAddress', 'business_address', 'business', ALL_CONTEXTS),
  field('businessEmail', 'business_email', 'business', ALL_CONTEXTS),
  field('businessWebsite', 'business_website', 'business', ALL_CONTEXTS),
];

/** Historical tokens remain known so interpolation blanks missing values. */
export const RETIRED_MERGE_TOKENS: readonly string[] = [
  'member_location',
  'payment_plan_name',
  'payment_invoice_number',
  'business_location_name',
];
/** Token names (no braces) a field answers to: its own plus its aliases. */
export function mergeFieldNames(entry: AutomationMergeField): readonly string[] {
  return [entry.token.replace(/[{}]/g, ''), ...(entry.aliases ?? [])];
}
export const AUTOMATION_MERGE_ALIASES: readonly string[] = AUTOMATION_MERGE_FIELDS.flatMap(
  (entry) => entry.aliases ?? [],
);
export const AUTOMATION_MERGE_KEYS: readonly string[] = [
  ...AUTOMATION_MERGE_FIELDS.flatMap(mergeFieldNames),
  ...RETIRED_MERGE_TOKENS,
];

export function mergeFieldsForTrigger(
  triggerType: AutomationTriggerType,
): readonly AutomationMergeField[] {
  const trigger = AUTOMATION_TRIGGER_CATALOG.find((entry) => entry.value === triggerType);
  return trigger
    ? AUTOMATION_MERGE_FIELDS.filter((entry) => entry.contexts.includes(trigger.entityType))
    : [];
}
