import { describe, expect, it } from 'vitest';
import {
  GYM_ONBOARDING_STEPS,
  GYM_ONBOARDING_STEP_SCHEMAS,
  gymOnboardingAccountSchema,
  gymOnboardingLocaleSchema,
  gymOnboardingBrandSchema,
  gymOnboardingLocationSchema,
} from './gym-onboarding';

describe('gym onboarding contracts', () => {
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
  it('validates locale and colours', () => {
    expect(
      gymOnboardingLocaleSchema.safeParse({
        language: 'ka',
        currency: 'GEL',
        timezone: 'Asia/Tbilisi',
      }).success,
    ).toBe(true);
    expect(
      gymOnboardingLocaleSchema.safeParse({ language: 'ka', currency: 'gel', timezone: 'invalid' })
        .success,
    ).toBe(false);
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
