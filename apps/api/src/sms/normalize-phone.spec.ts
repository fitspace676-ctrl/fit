import { describe, expect, it } from 'vitest';
import { normalizeGeorgianMobile } from './normalize-phone';

describe('normalizeGeorgianMobile', () => {
  it.each(['+995 599 12 34 56', '995599123456', '0599123456', '599123456', '(599) 12-34-56'])(
    'normalizes %s',
    (phone) => {
      expect(normalizeGeorgianMobile(phone)).toBe('599123456');
    },
  );
  it.each([
    null,
    undefined,
    '',
    '995321234567',
    '+15591234567',
    '59912345',
    '5991234567',
    'call599123456',
    '+599123456',
  ])('rejects %s', (phone) => {
    expect(normalizeGeorgianMobile(phone)).toBeNull();
  });
});
