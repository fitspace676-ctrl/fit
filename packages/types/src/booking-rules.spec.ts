import { describe, expect, it } from 'vitest';
import {
  gymNoShowSettingsSchema,
  isNoShowBlockRuleActive,
  updateGymSettingsSchema,
} from './gym-settings';
describe('class booking rule settings', () => {
  it('defaults the rule off', () => {
    const rule = gymNoShowSettingsSchema.parse({});
    expect(rule).toMatchObject({
      strikeLimit: 0,
      strikeWindowDays: 0,
      blockDays: 0,
      strikesSince: null,
    });
    expect(isNoShowBlockRuleActive(rule)).toBe(false);
  });
  it('requires all three positive controls to activate', () => {
    expect(isNoShowBlockRuleActive({ strikeLimit: 3, strikeWindowDays: 30, blockDays: 7 })).toBe(
      true,
    );
    expect(isNoShowBlockRuleActive({ strikeLimit: 3, strikeWindowDays: 0, blockDays: 7 })).toBe(
      false,
    );
  });
  it('rejects a client-provided activation timestamp', () => {
    expect(
      updateGymSettingsSchema.safeParse({ noShow: { strikesSince: '2026-11-19T12:00:00Z' } })
        .success,
    ).toBe(false);
    expect(updateGymSettingsSchema.parse({ noShow: { strikeLimit: 3 } })).toEqual({
      noShow: { strikeLimit: 3 },
    });
  });
  it.each([
    { strikeLimit: 51 },
    { strikeLimit: 1.5 },
    { strikeWindowDays: 366 },
    { blockDays: -1 },
    { blockDays: 366 },
  ])('rejects invalid rule values %o', (noShow) => {
    expect(updateGymSettingsSchema.safeParse({ noShow }).success).toBe(false);
  });
});
