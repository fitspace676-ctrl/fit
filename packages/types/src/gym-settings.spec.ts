import { describe, expect, it } from 'vitest';
import { paymentMethodSchema } from './orders';
import {
  STAFF_COLUMN_FIELDS,
  STAFF_SECTION_FIELDS,
  INVOICE_SEQ_PAD_WIDTH,
  enabledPaymentMethods,
  formatInvoiceNumber,
  gymInvoiceSettingsSchema,
  gymMemberIntakeSettingsSchema,
  gymPaymentMethodsSchema,
  invoiceNumberCarriesYear,
  isPaymentMethodEnabled,
  gymSettingsStoredSchema,
  gymStaffDirectorySettingsSchema,
  requiredIntakeFields,
  updateGymSettingsSchema,
  type GymInvoiceSettings,
  type GymMemberIntakeSettings,
} from './gym-settings';

describe('gymMemberIntakeSettingsSchema', () => {
  it('defaults identity + contact fields on, and health/payment/surname off', () => {
    expect(gymMemberIntakeSettingsSchema.parse({})).toEqual({
      name: true,
      surname: false,
      email: true,
      phone: true,
      gender: true,
      dateOfBirth: true,
      personalId: true,
      address: true,
      emergencyContact: true,
      membershipPlan: true,
      // Health data is an explicit decision, not a box a form happened to offer.
      medicalNotes: false,
      paymentMethod: false,
    });
  });

  it('is part of stored settings and defaults from a bare object', () => {
    const stored = gymSettingsStoredSchema.parse({});
    expect(stored.memberIntake.name).toBe(true);
    expect(stored.memberIntake.personalId).toBe(true);
    expect(stored.memberIntake.medicalNotes).toBe(false);
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

describe('requiredIntakeFields', () => {
  const intake = (patch: Partial<GymMemberIntakeSettings> = {}): GymMemberIntakeSettings =>
    gymMemberIntakeSettingsSchema.parse(patch);

  it('makes every field the default gym switched on mandatory', () => {
    expect(requiredIntakeFields(intake()).sort()).toEqual([
      'address',
      'dateOfBirth',
      'emergencyContact',
      'gender',
      'personalId',
      'phone',
    ]);
  });

  it('leaves a gym that switched everything off with nothing to demand', () => {
    const allOff = Object.fromEntries(
      Object.keys(intake()).map((field) => [field, false]),
    ) as GymMemberIntakeSettings;
    expect(requiredIntakeFields(allOff)).toEqual([]);
  });

  // The exemptions, pinned: `name`/`email` are the member's identity and already
  // required by `createMemberSchema`, and the enrolment pair is hidden outright at
  // the POS till — demanding either there would make a walk-in uncreatable.
  it('never demands name, email, membershipPlan or paymentMethod, even all-on', () => {
    const allOn = Object.fromEntries(
      Object.keys(intake()).map((field) => [field, true]),
    ) as GymMemberIntakeSettings;
    const required = requiredIntakeFields(allOn);

    expect(required).not.toContain('name');
    expect(required).not.toContain('email');
    expect(required).not.toContain('membershipPlan');
    expect(required).not.toContain('paymentMethod');
    // Everything else an all-on gym asked for, it gets.
    expect(required.sort()).toEqual([
      'address',
      'dateOfBirth',
      'emergencyContact',
      'gender',
      'medicalNotes',
      'personalId',
      'phone',
      'surname',
    ]);
  });

  it('follows a single toggle in both directions', () => {
    expect(requiredIntakeFields(intake({ medicalNotes: true }))).toContain('medicalNotes');
    expect(requiredIntakeFields(intake({ personalId: false }))).not.toContain('personalId');
  });
});

describe('gymStaffDirectorySettingsSchema', () => {
  // The whole point of the defaults: a gym that never opens the new screen must
  // see the staff page it saw yesterday. Pin that, column by column.
  it('defaults to the staff page exactly as it stands today', () => {
    expect(gymStaffDirectorySettingsSchema.parse({})).toEqual({
      // Shown today.
      lastName: true,
      role: true,
      status: true,
      whosWorking: true,
      roles: true,
      // Data the roster already carries but has never rendered.
      location: false,
      email: false,
      phone: false,
      joined: false,
    });
  });

  it('is part of stored settings and defaults from a bare object', () => {
    const stored = gymSettingsStoredSchema.parse({});
    expect(stored.staffDirectory.role).toBe(true);
    expect(stored.staffDirectory.email).toBe(false);
  });

  // The two lists drive both the Settings screen's groups and the page's render
  // order. If a toggle is added to the schema but not to a list, it becomes a
  // setting nobody can reach — so cover the schema exactly, with no overlap.
  it('splits every toggle into exactly one of the two field lists', () => {
    const listed = [...STAFF_COLUMN_FIELDS, ...STAFF_SECTION_FIELDS];
    const schemaKeys = Object.keys(gymStaffDirectorySettingsSchema.parse({}));

    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...schemaKeys].sort());
  });

  it('accepts a partial update and rejects unknown keys', () => {
    expect(updateGymSettingsSchema.parse({ staffDirectory: { email: true } })).toEqual({
      staffDirectory: { email: true },
    });
    expect(updateGymSettingsSchema.safeParse({ staffDirectory: { nope: true } }).success).toBe(
      false,
    );
  });
});

describe('enabledPaymentMethods', () => {
  it('accepts every settlement method until a gym says otherwise', () => {
    expect(enabledPaymentMethods(gymPaymentMethodsSchema.parse({}))).toEqual([
      'cash',
      'card',
      'member_account',
    ]);
  });

  it('drops the methods the gym switched off, keeping the till’s display order', () => {
    const payments = gymPaymentMethodsSchema.parse({ acceptCash: false });

    expect(enabledPaymentMethods(payments)).toEqual(['card', 'member_account']);
  });

  // The setting is named for the member's prepaid balance and the till's button for
  // the account it hangs off — one policy, two names. A rename on either side that
  // forgets the other would silently re-open a method the gym had closed.
  it('governs the till’s member-account button with the prepaid-credits toggle', () => {
    const payments = gymPaymentMethodsSchema.parse({ acceptPrepaidCredits: false });

    expect(enabledPaymentMethods(payments)).toEqual(['cash', 'card']);
    expect(isPaymentMethodEnabled(payments, 'member_account')).toBe(false);
  });

  it('can be emptied — the "keep one" rule lives at the write, not in the shape', () => {
    const none = gymPaymentMethodsSchema.parse({
      acceptCash: false,
      acceptCard: false,
      acceptPrepaidCredits: false,
    });

    expect(enabledPaymentMethods(none)).toEqual([]);
  });

  it('agrees with isPaymentMethodEnabled for every method', () => {
    const payments = gymPaymentMethodsSchema.parse({ acceptCard: false });

    for (const method of paymentMethodSchema.options) {
      expect(isPaymentMethodEnabled(payments, method)).toBe(
        enabledPaymentMethods(payments).includes(method),
      );
    }
  });
});

describe('formatInvoiceNumber', () => {
  const numbering = (over: Partial<GymInvoiceSettings> = {}): GymInvoiceSettings =>
    gymInvoiceSettingsSchema.parse(over);

  it('keeps the bare year-and-sequence shape when no composition is given', () => {
    expect(formatInvoiceNumber(2026, 1)).toBe('2026-0001');
    expect(formatInvoiceNumber(2026, 42)).toBe('2026-0042');
    expect(formatInvoiceNumber(2026, 1234)).toBe('2026-1234');
  });

  it('builds each of the three shapes a gym can choose', () => {
    expect(formatInvoiceNumber(2026, 1000, numbering({ format: 'prefix-year-number' }))).toBe(
      'INV-2026-1000',
    );
    expect(formatInvoiceNumber(2026, 1000, numbering({ format: 'prefix-number' }))).toBe(
      'INV-1000',
    );
    expect(formatInvoiceNumber(2026, 1000, numbering({ format: 'year-number' }))).toBe('2026-1000');
  });

  it('honours the gym’s own prefix, trimming the padding it types around it', () => {
    expect(formatInvoiceNumber(2026, 7, numbering({ prefix: '  FC  ' }))).toBe('FC-2026-0007');
  });

  // A gym that clears the field should not be stamped with a leading dash, and the
  // preview must agree — which it does, because both call this.
  it('drops the prefix segment entirely when the prefix is blank', () => {
    expect(
      formatInvoiceNumber(2026, 7, numbering({ prefix: '', format: 'prefix-year-number' })),
    ).toBe('2026-0007');
    expect(
      formatInvoiceNumber(2026, 7, numbering({ prefix: '   ', format: 'prefix-number' })),
    ).toBe('0007');
  });

  it('renders a sequence that outgrows the pad width at its natural width (no truncation)', () => {
    expect(INVOICE_SEQ_PAD_WIDTH).toBe(4);
    expect(formatInvoiceNumber(2026, 10_000)).toBe('2026-10000');
    expect(formatInvoiceNumber(2026, 123_456)).toBe('2026-123456');
  });

  it('is monotonic — a later sequence sorts after an earlier one within a year', () => {
    expect(formatInvoiceNumber(2026, 2) > formatInvoiceNumber(2026, 1)).toBe(true);
    expect(formatInvoiceNumber(2026, 10) > formatInvoiceNumber(2026, 9)).toBe(true);
  });

  // Which counter the mint site draws from hangs off this: a shape printing no year
  // must not restart in January, or it re-issues last year's references.
  it('reports which shapes carry their year', () => {
    expect(invoiceNumberCarriesYear(numbering({ format: 'prefix-year-number' }))).toBe(true);
    expect(invoiceNumberCarriesYear(numbering({ format: 'year-number' }))).toBe(true);
    expect(invoiceNumberCarriesYear(numbering({ format: 'prefix-number' }))).toBe(false);
  });
});

describe('gymSettingsStoredSchema and the removed sections', () => {
  // Every gym that used the console before the Auto-renewal and Notifications
  // sections were dropped still has their keys sitting in `Gym.settings`. The
  // stored schema is deliberately non-strict, so those blobs keep parsing and the
  // dead keys fall away on the next save — no migration, no read that throws.
  it('parses a blob still carrying autoRenewal / notifications, and drops them', () => {
    const stored = gymSettingsStoredSchema.parse({
      autoRenewal: { enabled: true, retryAttempts: 3 },
      notifications: { fromName: 'Downtown Fitness', replyTo: 'hi@downtown.example' },
      locale: { currency: 'USD' },
    });

    expect('autoRenewal' in stored).toBe(false);
    expect('notifications' in stored).toBe(false);
    // Everything alongside them is untouched.
    expect(stored.locale.currency).toBe('USD');
    expect(stored.receipt.emailEnabled).toBe(true);
  });

  it('refuses an update naming a section that no longer exists', () => {
    expect(updateGymSettingsSchema.safeParse({ autoRenewal: { enabled: false } }).success).toBe(
      false,
    );
    expect(updateGymSettingsSchema.safeParse({ notifications: { fromName: 'X' } }).success).toBe(
      false,
    );
  });
});
