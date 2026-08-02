import { describe, expect, it } from 'vitest';
import {
  gymMemberIntakeSettingsSchema,
  gymSettingsStoredSchema,
  updateGymSettingsSchema,
} from './gym-settings';

describe('gymMemberIntakeSettingsSchema', () => {
  it('defaults name/email/phone/plan on and the rest off', () => {
    expect(gymMemberIntakeSettingsSchema.parse({})).toEqual({
      name: true,
      surname: false,
      email: true,
      phone: true,
      gender: false,
      dateOfBirth: false,
      personalId: false,
      address: false,
      emergencyContact: false,
      membershipPlan: true,
      paymentMethod: false,
      medicalNotes: false,
    });
  });

  it('is part of stored settings and defaults from a bare object', () => {
    const stored = gymSettingsStoredSchema.parse({});
    expect(stored.memberIntake.name).toBe(true);
    expect(stored.memberIntake.gender).toBe(false);
    // grace-period membership section is gone
    expect('membership' in stored).toBe(false);
  });

  it('accepts a partial memberIntake update and rejects unknown keys', () => {
    expect(updateGymSettingsSchema.parse({ memberIntake: { gender: true } })).toEqual({
      memberIntake: { gender: true },
    });
    expect(updateGymSettingsSchema.safeParse({ memberIntake: { nope: true } }).success).toBe(false);
  });

  // The console had no National ID control, so the flag existed but could never be
  // switched on — and both the roster drawer and the POS till read this config to
  // decide what to ask for. Pin the write path now that Settings exposes it.
  it('carries personalId through an update', () => {
    expect(updateGymSettingsSchema.parse({ memberIntake: { personalId: true } })).toEqual({
      memberIntake: { personalId: true },
    });
  });
});
