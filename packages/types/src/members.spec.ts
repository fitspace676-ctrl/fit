import { describe, expect, it } from 'vitest';
import {
  createMemberNoteSchema,
  createMemberSchema,
  createMemberTaskSchema,
  updateMemberSchema,
  updateMemberTaskSchema,
} from './members';

describe('createMemberSchema', () => {
  it('accepts a minimal member (name + email) and defaults status to ACTIVE', () => {
    const parsed = createMemberSchema.parse({ name: '  Ana Beridze ', email: 'ANA@Example.com' });
    expect(parsed.name).toBe('Ana Beridze');
    expect(parsed.email).toBe('ana@example.com');
    expect(parsed.status).toBe('ACTIVE');
    // Omitted profile fields stay undefined so the service leaves columns untouched.
    expect(parsed.dateOfBirth).toBeUndefined();
    expect(parsed.gender).toBeUndefined();
  });

  it('carries profile extras + an optional plan enrolment', () => {
    const parsed = createMemberSchema.parse({
      name: 'Nino',
      email: 'nino@example.com',
      gender: 'FEMALE',
      address: '12 Rustaveli Ave',
      emergencyContactName: 'Data',
      emergencyContactPhone: '+995 555 00 00 00',
      medicalNotes: 'None',
      planId: 'plan_1',
      startDate: '2026-07-01',
      paymentMethod: 'CASH',
    });
    expect(parsed.gender).toBe('FEMALE');
    expect(parsed.planId).toBe('plan_1');
    expect(parsed.startDate).toBe('2026-07-01');
  });

  it('rejects an invalid email and an unknown gender', () => {
    expect(createMemberSchema.safeParse({ name: 'x', email: 'nope' }).success).toBe(false);
    expect(
      createMemberSchema.safeParse({ name: 'x', email: 'x@y.z', gender: 'ROBOT' }).success,
    ).toBe(false);
  });
});

describe('updateMemberSchema', () => {
  it('clears an emptied profile field to null but leaves omitted fields undefined', () => {
    const parsed = updateMemberSchema.parse({ name: 'Ana', phone: '', address: '   ' });
    expect(parsed.phone).toBeNull();
    expect(parsed.address).toBeNull();
    expect(parsed.medicalNotes).toBeUndefined();
  });

  // The admin parses the form, then sends the *parsed* body to the API, which
  // parses it again with this same schema. So the schema's output has to be valid
  // input — otherwise every edit that empties a field 400s on the second parse.
  it('accepts its own output, so a parsed body survives the trip to the API', () => {
    const fromForm = updateMemberSchema.parse({
      name: 'Ana',
      phone: '',
      dateOfBirth: '',
      address: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      medicalNotes: '',
    });

    // What actually crosses the wire — `undefined` keys drop out of the JSON.
    const overTheWire = JSON.parse(JSON.stringify(fromForm)) as unknown;

    const atTheApi = updateMemberSchema.safeParse(overTheWire);
    expect(atTheApi.success).toBe(true);
  });

  it('round-trips a cleared field as still-cleared rather than re-reading it as text', () => {
    const once = updateMemberSchema.parse({ name: 'Ana', phone: '', address: '' });
    const twice = updateMemberSchema.parse(JSON.parse(JSON.stringify(once)));
    expect(twice.phone).toBeNull();
    expect(twice.address).toBeNull();
  });
});

describe('member note / task schemas', () => {
  it('requires a non-empty note body', () => {
    expect(createMemberNoteSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(createMemberNoteSchema.parse({ body: ' call back ' }).body).toBe('call back');
  });

  it('accepts a task with only a title, and an optional due date + assignee', () => {
    expect(createMemberTaskSchema.parse({ title: 'Follow up' }).dueDate).toBeUndefined();
    const full = createMemberTaskSchema.parse({
      title: 'Chase payment',
      dueDate: '2026-07-10',
      assignee: 'Front Desk',
    });
    expect(full.assignee).toBe('Front Desk');
  });

  it('constrains task status to PENDING / DONE', () => {
    expect(updateMemberTaskSchema.parse({ status: 'DONE' }).status).toBe('DONE');
    expect(updateMemberTaskSchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
  });
});
