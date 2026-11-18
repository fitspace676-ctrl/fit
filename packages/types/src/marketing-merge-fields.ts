import { AUTOMATION_MERGE_FIELDS, mergeFieldNames } from './automation-merge-fields';

/** Campaigns have member/subscription facts, but no triggering class or order. */
export const MARKETING_MERGE_GROUPS = ['member', 'membership', 'business'] as const;
export type MarketingMergeGroup = (typeof MARKETING_MERGE_GROUPS)[number];
export interface MarketingMergeFieldDef {
  key: string;
  token: string;
  label: string;
  group: MarketingMergeGroup;
}

/** One source of truth: old spellings remain accepted aliases, never duplicate chips. */
const fields = AUTOMATION_MERGE_FIELDS.filter(
  (field) =>
    field.contexts.includes('member') &&
    MARKETING_MERGE_GROUPS.includes(field.group as MarketingMergeGroup),
);
export const MARKETING_MERGE_FIELD_DEFS: readonly MarketingMergeFieldDef[] = fields.map(
  (field) => ({ ...field, group: field.group as MarketingMergeGroup, label: field.key }),
);
export const RETIRED_MARKETING_TOKENS: readonly string[] = ['location', 'class_name'];
export const MARKETING_MERGE_TOKEN_NAMES: readonly string[] = [
  ...fields.flatMap(mergeFieldNames),
  ...RETIRED_MARKETING_TOKENS,
];
