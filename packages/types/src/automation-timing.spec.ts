import { describe, expect, it } from 'vitest';
import {
  LEGACY_TIMING_OFFSETS,
  automationTimingOffsetSchema,
  parseTimingOffset,
  normalizeTimingOffset,
  formatTimingOffset,
  timingOffsetDays,
} from './automation-timing';

describe('automation timing', () => {
  it.each(Object.entries(LEGACY_TIMING_OFFSETS))(
    'keeps legacy %s readable',
    (legacy, normalized) => {
      expect(normalizeTimingOffset(legacy)).toBe(normalized);
      expect(parseTimingOffset(legacy)).toEqual(parseTimingOffset(normalized));
    },
  );
  it.each(['0d', '-365d', '365d', '-8760h', '8760h', '3h'])('accepts %s', (value) => {
    expect(automationTimingOffsetSchema.safeParse(value).success).toBe(true);
  });
  it.each([
    '366d',
    '-366d',
    '8761h',
    '-8761h',
    '10000h',
    '1.5d',
    '+1d',
    '1w',
    '',
    'constructor',
    ' 1d',
  ])('rejects %s', (value) => {
    expect(automationTimingOffsetSchema.safeParse(value).success).toBe(false);
    expect(() => parseTimingOffset(value)).toThrow();
  });
  it('parses units, normalizes zeros and floors scan hours including negatives', () => {
    expect(parseTimingOffset('3h')).toEqual({ amount: 3, unit: 'h', ms: 10800000 });
    expect(normalizeTimingOffset('-000d')).toBe('0d');
    expect(formatTimingOffset(-2, 'd')).toBe('-2d');
    expect(() => formatTimingOffset(1.5, 'd')).toThrow();
    expect(timingOffsetDays('23h')).toBe(0);
    expect(timingOffsetDays('-1h')).toBe(-1);
    expect(timingOffsetDays('25h')).toBe(1);
  });
});
