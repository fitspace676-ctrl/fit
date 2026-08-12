/**
 * The merge fields a marketing template or campaign may insert.
 *
 * The marketing twin of `./automation-merge-fields`, governed by the same two
 * rules, and deliberately NOT merged with it: the two vocabularies spell the same
 * facts differently (`{{first_name}}` here, `{{member_first_name}}` there) and
 * unifying them would invalidate every campaign and template body already saved.
 *
 * 1. **Every field must be fillable.** A token the resolver cannot fill is not a
 *    feature — `interpolateMergeFields` blanks known tokens, so an unfillable
 *    chip does not fail loudly, it silently delivers an empty string. `location`
 *    and `class_name` did exactly that and are retired below.
 * 2. **Retiring a field does not un-know its token.** See
 *    {@link RETIRED_MARKETING_TOKENS}.
 *
 * "Fillable" means fillable by `buildMemberMergeValues`
 * (`apps/api/src/members/member-merge-values.ts`) — the member email drawer is
 * the only path that actually delivers marketing copy today. `sendCampaign` flips
 * a status and sends nothing. These tokens also reach members through automation
 * rule sends, whose resolver (`AutomationMergeService.mergeValues`) fills the ones
 * a rule's trigger can back; the two resolvers overlap but are not identical.
 */

/** The catalogue's grouping, in the order the composer and Settings show them. */
export const MARKETING_MERGE_GROUPS = ['member', 'membership', 'business'] as const;

/** One merge-field group — a member of {@link MARKETING_MERGE_GROUPS}. */
export type MarketingMergeGroup = (typeof MARKETING_MERGE_GROUPS)[number];

/**
 * One catalogue entry.
 *
 * Distinct from `MarketingMergeField` in `./marketing`, which is the WIRE shape
 * (`{ token, label }`) the composer renders. This is the fuller internal record:
 * the `key` is what the settings toggle hangs off, the `group` is what Settings
 * sorts by, and only `token` + `label` cross the wire.
 */
export interface MarketingMergeFieldDef {
  key: string;
  token: string;
  label: string;
  group: MarketingMergeGroup;
}

/** Every merge field a marketing message may insert. */
export const MARKETING_MERGE_FIELD_DEFS: readonly MarketingMergeFieldDef[] = [
  // -- The person --
  { key: 'firstName', token: '{{first_name}}', label: 'First name', group: 'member' },
  { key: 'lastName', token: '{{last_name}}', label: 'Last name', group: 'member' },
  { key: 'fullName', token: '{{full_name}}', label: 'Full name', group: 'member' },
  { key: 'email', token: '{{email}}', label: 'Email', group: 'member' },
  { key: 'phone', token: '{{phone}}', label: 'Phone', group: 'member' },
  { key: 'joinDate', token: '{{join_date}}', label: 'Join date', group: 'member' },
  { key: 'birthday', token: '{{birthday}}', label: 'Birthday', group: 'member' },
  { key: 'memberStatus', token: '{{member_status}}', label: 'Status', group: 'member' },
  // -- Their membership --
  { key: 'planName', token: '{{plan_name}}', label: 'Plan name', group: 'membership' },
  { key: 'expiryDate', token: '{{expiry_date}}', label: 'Expiry date', group: 'membership' },
  {
    key: 'daysUntilExpiry',
    token: '{{days_until_expiry}}',
    label: 'Days until expiry',
    group: 'membership',
  },
  {
    key: 'paymentAmount',
    token: '{{payment_amount}}',
    label: 'Payment amount',
    group: 'membership',
  },
  { key: 'renewalDate', token: '{{renewal_date}}', label: 'Renewal date', group: 'membership' },
  // -- The gym --
  { key: 'businessName', token: '{{business_name}}', label: 'Business name', group: 'business' },
  { key: 'businessPhone', token: '{{business_phone}}', label: 'Business phone', group: 'business' },
  { key: 'businessEmail', token: '{{business_email}}', label: 'Business email', group: 'business' },
  {
    key: 'businessAddress',
    token: '{{business_address}}',
    label: 'Business address',
    group: 'business',
  },
  {
    key: 'businessWebsite',
    token: '{{business_website}}',
    label: 'Business website',
    group: 'business',
  },
];

/**
 * Tokens the composer no longer offers but that saved bodies may still contain.
 *
 * `location` has no member column to resolve from; `class_name` has no class in a
 * campaign's context. Both were offered and filled by nothing, so both reached
 * members as empty string. They stay *known* so the blanking pass keeps handling
 * them. Additions here are permanent; this list only ever grows.
 */
export const RETIRED_MARKETING_TOKENS: readonly string[] = ['location', 'class_name'];

/** The bare name of every marketing token — offered and retired alike. */
export const MARKETING_MERGE_TOKEN_NAMES: readonly string[] = [
  ...MARKETING_MERGE_FIELD_DEFS.map((field) => field.token.replace(/[{}]/g, '')),
  ...RETIRED_MARKETING_TOKENS,
];
