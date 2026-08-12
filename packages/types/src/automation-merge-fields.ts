/**
 * The merge fields an automation rule's message can carry (T12.5, phase B).
 *
 * One catalogue, three consumers: the rule editor renders its chips from it, the
 * Settings screen renders a toggle per entry, and the executor's resolver fills
 * every token in it. Keeping them on one list is what makes the promise behind
 * this file enforceable — a chip a gym can insert is a chip the send will expand.
 *
 * Two rules govern what belongs here:
 *
 * 1. **Every field must be fillable.** A token the executor cannot resolve is not
 *    a feature, it is a blank the member notices. The `class_*` group that used to
 *    sit in the editor is gone for exactly this reason: the only triggers that
 *    ever dispatch are `member_joined` and `membership_expiring`, neither of which
 *    has a class, so those chips could never have produced anything.
 * 2. **Retiring a field does not un-know its token.** See
 *    {@link RETIRED_MERGE_TOKENS}.
 */

/** The catalogue's grouping, in the order the editor and Settings show them. */
export const AUTOMATION_MERGE_GROUPS = ['member', 'membership', 'business'] as const;

/** One merge-field group — a member of {@link AUTOMATION_MERGE_GROUPS}. */
export type AutomationMergeGroup = (typeof AUTOMATION_MERGE_GROUPS)[number];

/** One insertable merge field. */
export interface AutomationMergeField {
  /** Stable key — the settings toggle and the i18n label both hang off this. */
  key: string;
  /** The token as it appears in a message body, braces included. */
  token: string;
  /** Which section of the picker it sits in. */
  group: AutomationMergeGroup;
}

/**
 * Every merge field a rule may insert.
 *
 * Token spellings are preserved across the phase-B rewrite even where the label
 * changed (`{{payment_amount}}` is the membership price, `{{member_plan_name}}`
 * the plan) so that rule bodies gyms have already saved keep working.
 */
export const AUTOMATION_MERGE_FIELDS: readonly AutomationMergeField[] = [
  // -- The person --
  { key: 'memberFirstName', token: '{{member_first_name}}', group: 'member' },
  { key: 'memberLastName', token: '{{member_last_name}}', group: 'member' },
  { key: 'memberFullName', token: '{{member_full_name}}', group: 'member' },
  { key: 'memberEmail', token: '{{member_email}}', group: 'member' },
  { key: 'memberPhone', token: '{{member_phone}}', group: 'member' },
  { key: 'memberStatus', token: '{{member_status}}', group: 'member' },
  { key: 'memberJoinDate', token: '{{member_join_date}}', group: 'member' },
  { key: 'memberBirthday', token: '{{member_birthday}}', group: 'member' },
  { key: 'memberCheckinCount', token: '{{member_checkin_count}}', group: 'member' },
  { key: 'memberPointsBalance', token: '{{member_points_balance}}', group: 'member' },
  // -- Their membership --
  { key: 'membershipPlanName', token: '{{member_plan_name}}', group: 'membership' },
  { key: 'membershipExpiryDate', token: '{{member_expiry_date}}', group: 'membership' },
  { key: 'membershipDaysLeft', token: '{{member_days_until_expiry}}', group: 'membership' },
  { key: 'membershipPrice', token: '{{payment_amount}}', group: 'membership' },
  { key: 'membershipRenewalDate', token: '{{payment_due_date}}', group: 'membership' },
  // -- The gym --
  { key: 'businessName', token: '{{business_name}}', group: 'business' },
  { key: 'businessPhone', token: '{{business_phone}}', group: 'business' },
  { key: 'businessAddress', token: '{{business_address}}', group: 'business' },
  { key: 'businessEmail', token: '{{business_email}}', group: 'business' },
  { key: 'businessWebsite', token: '{{business_website}}', group: 'business' },
];

/**
 * Tokens the editor no longer offers but that saved rule bodies may still contain.
 *
 * They stay *known* so {@link interpolateMergeFields} blanks them on send. Drop a
 * token from this list and a rule written before it was retired starts delivering
 * literal `{{class_name}}` to a member — the one outcome the blanking pass exists
 * to prevent. Additions here are permanent; this list only ever grows.
 */
export const RETIRED_MERGE_TOKENS: readonly string[] = [
  'class_name',
  'class_date',
  'class_time',
  'class_trainer_name',
  'class_location',
  'member_location',
  'payment_plan_name',
  'payment_invoice_number',
  'business_location_name',
];

/** The bare name of every automation token — offered and retired alike. */
export const AUTOMATION_MERGE_KEYS: readonly string[] = [
  ...AUTOMATION_MERGE_FIELDS.map((field) => field.token.replace(/[{}]/g, '')),
  ...RETIRED_MERGE_TOKENS,
];
