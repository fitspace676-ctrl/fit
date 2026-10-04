import { describe, expect, it } from 'vitest';
import { createPlatformLeadSchema, PLATFORM_LEAD_TYPES } from './platform';

describe('createPlatformLeadSchema', () => {
  it('covers every marketing form the site posts from', () => {
    expect(PLATFORM_LEAD_TYPES).toEqual(['trial', 'demo', 'pricing', 'call']);
  });

  it('accepts a pricing request carrying only a name and email', () => {
    const result = createPlatformLeadSchema.parse({
      type: 'pricing',
      name: '  Giorgi  ',
      email: 'GIORGI@Gym.GE',
    });

    expect(result).toEqual({
      type: 'pricing',
      name: 'Giorgi',
      email: 'giorgi@gym.ge',
      business: undefined,
      phone: undefined,
      message: undefined,
    });
  });

  it('rejects a pricing request without a usable email', () => {
    expect(
      createPlatformLeadSchema.safeParse({ type: 'pricing', name: 'Giorgi', email: '  ' }).success,
    ).toBe(false);
  });

  it('accepts a call request with a name, email and phone', () => {
    const result = createPlatformLeadSchema.parse({
      type: 'call',
      name: 'Giorgi',
      email: 'giorgi@gym.ge',
      phone: ' +995 555 12 34 56 ',
    });

    expect(result).toMatchObject({ type: 'call', phone: '+995 555 12 34 56' });
  });

  it('rejects a call request without a phone', () => {
    const result = createPlatformLeadSchema.safeParse({
      type: 'call',
      name: 'Giorgi',
      email: 'giorgi@gym.ge',
      phone: '  ',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['phone']);
  });

  it('rejects a form the site does not have', () => {
    expect(
      createPlatformLeadSchema.safeParse({ type: 'quote', name: 'Giorgi', email: 'g@gym.ge' })
        .success,
    ).toBe(false);
  });
});
