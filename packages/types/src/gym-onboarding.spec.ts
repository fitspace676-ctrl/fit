import { describe, expect, it } from 'vitest';
import {
  verifyGymOnboardingCodeSchema,
  GYM_ONBOARDING_STEPS,
  GYM_ONBOARDING_STEP_SCHEMAS,
  gymOnboardingAccountSchema,
  gymOnboardingBrandSchema,
  gymOnboardingLocationSchema,
} from './gym-onboarding';

describe('gym onboarding contracts', () => {
  it('accepts only a six-digit code and no mutable owner email', () => {
    expect(verifyGymOnboardingCodeSchema.parse({ code: '012345' })).toEqual({ code: '012345' });
    for (const body of [
      { code: '12345' },
      { code: 123456 },
      { code: '123456', email: 'other@example.com' },
    ]) {
      expect(verifyGymOnboardingCodeSchema.safeParse(body).success).toBe(false);
    }
  });
  it('defines every ordered step and rejects unknown fields', () => {
    expect(Object.keys(GYM_ONBOARDING_STEP_SCHEMAS)).toEqual([...GYM_ONBOARDING_STEPS]);
    expect(
      gymOnboardingAccountSchema.safeParse({
        ownerName: 'Owner',
        password: 'password',
        gymId: 'other',
      }).success,
    ).toBe(false);
  });
  it('trims names and enforces the shared password bounds', () => {
    expect(
      gymOnboardingAccountSchema.parse({ ownerName: ' Owner ', password: 'password' }).ownerName,
    ).toBe('Owner');
    for (const password of ['short', 'x'.repeat(257)]) {
      expect(gymOnboardingAccountSchema.safeParse({ ownerName: 'Owner', password }).success).toBe(
        false,
      );
    }
  });
  it('validates colours', () => {
    expect(gymOnboardingBrandSchema.safeParse({ primaryColor: '#aabbCC' }).success).toBe(true);
    expect(gymOnboardingBrandSchema.safeParse({ primaryColor: 'red' }).success).toBe(false);
  });
  it('normalizes location hours to the full week', () => {
    const result = gymOnboardingLocationSchema.parse({
      name: ' Main ',
      address: '',
      phone: null,
      hours: {},
    });
    expect(result.name).toBe('Main');
    expect(Object.keys(result.hours)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  });
});
