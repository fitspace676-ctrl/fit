import { describe, expect, it } from 'vitest';
import { loginIdentifier, loginRequestSchema, phoneLoginKey } from './auth';

describe('sign-in by email or phone', () => {
  it('reduces every spelling of one number to the same key', () => {
    for (const raw of [
      '599123456',
      '599 12 34 56',
      '+995 599 12-34-56',
      '995599123456',
      '0599123456',
    ]) {
      expect(phoneLoginKey(raw), raw).toBe('599123456');
    }
    expect(phoneLoginKey('12345678')).toBeNull();
    expect(phoneLoginKey('')).toBeNull();
    expect(phoneLoginKey(null)).toBeNull();
  });

  it('sorts what was typed into the field it belongs in', () => {
    expect(loginIdentifier(' Nino@Example.com ')).toEqual({ email: 'Nino@Example.com' });
    expect(loginIdentifier(' +995 599 12 34 56 ')).toEqual({ phone: '+995 599 12 34 56' });
    // Not a phone number: sent as an address, for the API to refuse.
    expect(loginIdentifier('12345')).toEqual({ email: '12345' });
    expect(loginIdentifier('nino')).toEqual({ email: 'nino' });
  });

  it('accepts an email or a phone, and refuses both or neither', () => {
    expect(loginRequestSchema.safeParse({ email: 'A@b.com', password: 'x' }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ phone: '599 12 34 56', password: 'x' }).success).toBe(
      true,
    );
    expect(loginRequestSchema.safeParse({ password: 'x' }).success).toBe(false);
    expect(
      loginRequestSchema.safeParse({ email: 'a@b.com', phone: '599123456', password: 'x' }).success,
    ).toBe(false);
    expect(loginRequestSchema.safeParse({ phone: '12345', password: 'x' }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ phone: 'call me maybe', password: 'x' }).success).toBe(
      false,
    );
  });
});
