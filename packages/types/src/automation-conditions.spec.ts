import { describe, expect, it } from 'vitest';
import {
  automationConditionsSchema,
  automationConditionSchema,
  evaluateAutomationConditions,
  type AutomationCondition,
  type AutomationConditionFacts,
} from './automation-conditions';

const facts: AutomationConditionFacts = {
  member_gender: 'FEMALE',
  member_age: 30,
  member_status: 'ACTIVE',
  member_kind: 'MEMBER',
  member_branch: null,
  member_tags: ['vip'],
  member_joined_days_ago: 100,
  member_last_checkin_days_ago: null,
  member_checkin_count: 10,
  subscription_plan: 'plan',
  subscription_status: 'ACTIVE',
  subscription_days_until_expiry: 5,
};
const matches = (condition: AutomationCondition) =>
  evaluateAutomationConditions([condition], facts);

describe('automation conditions', () => {
  it.each([
    ['eq', 30, true],
    ['eq', 31, false],
    ['neq', 31, true],
    ['neq', 30, false],
    ['gt', 29, true],
    ['gt', 30, false],
    ['gte', 30, true],
    ['gte', 31, false],
    ['lt', 31, true],
    ['lt', 30, false],
    ['lte', 30, true],
    ['lte', 29, false],
  ] as const)('numeric %s %s = %s', (operator, value, result) => {
    expect(matches({ field: 'member_age', operator, value })).toBe(result);
    expect(matches({ field: 'member_last_checkin_days_ago', operator, value })).toBe(false);
  });
  it('compares enum/select values and membership sets', () => {
    expect(matches({ field: 'member_status', operator: 'eq', value: 'ACTIVE' })).toBe(true);
    expect(matches({ field: 'member_status', operator: 'neq', value: 'ACTIVE' })).toBe(false);
    expect(matches({ field: 'member_status', operator: 'in', value: ['ACTIVE', 'INVITED'] })).toBe(
      true,
    );
    expect(matches({ field: 'member_status', operator: 'not_in', value: ['INVITED'] })).toBe(true);
    expect(matches({ field: 'member_status', operator: 'not_in', value: ['ACTIVE'] })).toBe(false);
    expect(matches({ field: 'member_branch', operator: 'neq', value: 'branch' })).toBe(false);
    expect(matches({ field: 'member_branch', operator: 'not_in', value: [] })).toBe(false);
  });
  it('checks list inclusion and explicit emptiness', () => {
    expect(matches({ field: 'member_tags', operator: 'contains', value: 'vip' })).toBe(true);
    expect(matches({ field: 'member_tags', operator: 'not_contains', value: 'vip' })).toBe(false);
    expect(matches({ field: 'member_tags', operator: 'not_contains', value: 'new' })).toBe(true);
    expect(matches({ field: 'member_tags', operator: 'is_empty' })).toBe(false);
    expect(matches({ field: 'member_tags', operator: 'is_not_empty' })).toBe(true);
    expect(matches({ field: 'member_branch', operator: 'is_empty' })).toBe(true);
    expect(matches({ field: 'member_branch', operator: 'is_not_empty' })).toBe(false);
    expect(
      evaluateAutomationConditions([{ field: 'member_tags', operator: 'is_empty' }], {
        ...facts,
        member_tags: [],
      }),
    ).toBe(true);
  });
  it('uses AND, defaults to an empty list and fails closed for unknown fields', () => {
    expect(automationConditionsSchema.parse(undefined)).toEqual([]);
    expect(evaluateAutomationConditions([], facts)).toBe(true);
    expect(
      evaluateAutomationConditions(
        [
          { field: 'member_age', operator: 'eq', value: 30 },
          { field: 'member_kind', operator: 'eq', value: 'GUEST' },
        ],
        facts,
      ),
    ).toBe(false);
    expect(
      matches({ field: 'unknown', operator: 'is_empty' } as unknown as AutomationCondition),
    ).toBe(false);
    expect(
      automationConditionsSchema.safeParse(
        Array(11).fill({ field: 'member_age', operator: 'eq', value: 30 }),
      ).success,
    ).toBe(false);
  });
  it.each([
    { field: 'member_age', operator: 'contains', value: '30' },
    { field: 'member_age', operator: 'eq', value: '30' },
    { field: 'member_status', operator: 'in', value: 'ACTIVE' },
    { field: 'member_status', operator: 'eq', value: ['ACTIVE'] },
    { field: 'member_status', operator: 'eq', value: 'UNKNOWN' },
    { field: 'member_branch', operator: 'is_empty', value: 'x' },
    { field: 'member_tags', operator: 'contains' },
  ])('rejects invalid condition %j', (condition) => {
    expect(automationConditionSchema.safeParse(condition).success).toBe(false);
  });
});
