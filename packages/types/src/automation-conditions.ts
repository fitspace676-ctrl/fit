import { z } from 'zod';

export const automationConditionFieldSchema = z.enum([
  'member_gender',
  'member_age',
  'member_status',
  'member_kind',
  'member_branch',
  'member_tags',
  'member_joined_days_ago',
  'member_last_checkin_days_ago',
  'member_checkin_count',
  'subscription_plan',
  'subscription_status',
  'subscription_days_until_expiry',
]);
export type AutomationConditionField = z.infer<typeof automationConditionFieldSchema>;
export const automationConditionOperatorSchema = z.enum([
  'eq',
  'neq',
  'in',
  'not_in',
  'is_empty',
  'is_not_empty',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
]);
export type AutomationConditionOperator = z.infer<typeof automationConditionOperatorSchema>;
export type AutomationConditionFieldType = 'enum' | 'number' | 'date' | 'list' | 'select';
export interface AutomationConditionFieldMeta {
  key: AutomationConditionField;
  type: AutomationConditionFieldType;
  group: 'member' | 'subscription';
  optionsSource?: 'locations' | 'plans' | 'tags';
  enumValues?: readonly string[];
}
export const AUTOMATION_CONDITION_FIELDS: readonly AutomationConditionFieldMeta[] = [
  { key: 'member_gender', type: 'enum', group: 'member', enumValues: ['MALE', 'FEMALE', 'OTHER'] },
  { key: 'member_age', type: 'number', group: 'member' },
  {
    key: 'member_status',
    type: 'enum',
    group: 'member',
    enumValues: ['ACTIVE', 'INVITED', 'SUSPENDED'],
  },
  {
    key: 'member_kind',
    type: 'enum',
    group: 'member',
    enumValues: ['MEMBER', 'GUEST', 'INACTIVE'],
  },
  { key: 'member_branch', type: 'select', group: 'member', optionsSource: 'locations' },
  { key: 'member_tags', type: 'list', group: 'member', optionsSource: 'tags' },
  { key: 'member_joined_days_ago', type: 'number', group: 'member' },
  { key: 'member_last_checkin_days_ago', type: 'number', group: 'member' },
  { key: 'member_checkin_count', type: 'number', group: 'member' },
  { key: 'subscription_plan', type: 'select', group: 'subscription', optionsSource: 'plans' },
  {
    key: 'subscription_status',
    type: 'enum',
    group: 'subscription',
    enumValues: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'FROZEN', 'CANCELED', 'EXPIRED'],
  },
  { key: 'subscription_days_until_expiry', type: 'number', group: 'subscription' },
];
export const OPERATORS_BY_TYPE: Record<
  AutomationConditionFieldType,
  readonly AutomationConditionOperator[]
> = {
  enum: ['eq', 'neq', 'in', 'not_in', 'is_empty', 'is_not_empty'],
  select: ['eq', 'neq', 'in', 'not_in', 'is_empty', 'is_not_empty'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  list: ['contains', 'not_contains', 'is_empty', 'is_not_empty'],
};
export const automationConditionSchema = z
  .object({
    field: automationConditionFieldSchema,
    operator: automationConditionOperatorSchema,
    value: z.union([z.string(), z.number().finite(), z.array(z.string())]).optional(),
  })
  .superRefine(({ field, operator, value }, ctx) => {
    const meta = AUTOMATION_CONDITION_FIELDS.find((entry) => entry.key === field)!;
    if (!OPERATORS_BY_TYPE[meta.type].includes(operator)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operator'],
        message: 'Operator does not match field type',
      });
    }
    const empty = operator === 'is_empty' || operator === 'is_not_empty';
    const multiple = operator === 'in' || operator === 'not_in';
    const valid = empty
      ? value === undefined
      : multiple
        ? Array.isArray(value)
        : meta.type === 'number'
          ? typeof value === 'number'
          : typeof value === 'string';
    if (!valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Value does not match operator',
      });
    }
    if (!empty && meta.enumValues && valid) {
      const values = Array.isArray(value) ? value : [value];
      if (values.some((item) => typeof item !== 'string' || !meta.enumValues!.includes(item))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: 'Unknown enum value',
        });
      }
    }
  });
export type AutomationCondition = z.infer<typeof automationConditionSchema>;
export const automationConditionsSchema = z.array(automationConditionSchema).max(10).default([]);

export interface AutomationConditionFacts {
  member_gender: string | null;
  member_age: number | null;
  member_status: string | null;
  member_kind: string | null;
  member_branch: string | null;
  member_tags: string[];
  member_joined_days_ago: number | null;
  member_last_checkin_days_ago: number | null;
  member_checkin_count: number;
  subscription_plan: string | null;
  subscription_status: string | null;
  subscription_days_until_expiry: number | null;
}

/** Missing facts only match explicit emptiness checks; comparisons never coerce null to zero. */
export function evaluateAutomationConditions(
  conditions: readonly AutomationCondition[],
  facts: AutomationConditionFacts,
): boolean {
  return conditions.every((condition) => {
    if (!automationConditionSchema.safeParse(condition).success) return false;
    const actual = facts[condition.field];
    const { operator, value } = condition;
    const empty = actual == null || actual === '' || (Array.isArray(actual) && actual.length === 0);
    if (operator === 'is_empty') return empty;
    if (operator === 'is_not_empty') return !empty;
    if (actual == null) return false;
    switch (operator) {
      case 'eq':
        return actual === value;
      case 'neq':
        return actual !== value;
      case 'in':
        return Array.isArray(value) && typeof actual === 'string' && value.includes(actual);
      case 'not_in':
        return Array.isArray(value) && typeof actual === 'string' && !value.includes(actual);
      case 'contains':
        return Array.isArray(actual) && typeof value === 'string' && actual.includes(value);
      case 'not_contains':
        return Array.isArray(actual) && typeof value === 'string' && !actual.includes(value);
      case 'gt':
        return typeof actual === 'number' && typeof value === 'number' && actual > value;
      case 'gte':
        return typeof actual === 'number' && typeof value === 'number' && actual >= value;
      case 'lt':
        return typeof actual === 'number' && typeof value === 'number' && actual < value;
      case 'lte':
        return typeof actual === 'number' && typeof value === 'number' && actual <= value;
      default:
        return false;
    }
  });
}
