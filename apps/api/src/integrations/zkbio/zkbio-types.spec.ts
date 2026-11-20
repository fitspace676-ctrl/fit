import { describe, expect, it } from 'vitest';
import { formatZkbioDate, parseZkbioDate } from './zkbio-types';
import { errorReason, ZkbioApiError } from './zkbio-errors';

describe('server-local dates', () => {
  it.each([240, 0, -330, 840, -720])(
    'round trips with offset %i without host timezone dependence',
    (offset) => {
      const date = new Date('2026-12-31T22:59:59Z');
      expect(parseZkbioDate(formatZkbioDate(date, offset), offset)).toEqual(date);
    },
  );
  it('formats +04:00 across midnight', () => {
    expect(formatZkbioDate(new Date('2026-12-31T22:00:00Z'), 240)).toBe('2027-01-01 02:00:00');
    expect(parseZkbioDate('2027-01-01 02:00:00', 240).toISOString()).toBe(
      '2026-12-31T22:00:00.000Z',
    );
  });
  it.each([
    '2026-02-30 00:00:00',
    '2026-13-01 00:00:00',
    '2026-01-01 24:00:00',
    '2026-1-1 00:00:00',
    '2026-01-01T00:00:00Z',
    'bad',
  ])('rejects %s', (value) => {
    expect(() => parseZkbioDate(value, 240)).toThrow(RangeError);
  });
  it.each([NaN, Infinity, 1.5, 841, -841])('rejects invalid offset %s', (offset) => {
    expect(() => formatZkbioDate(new Date(), offset)).toThrow(RangeError);
    expect(() => parseZkbioDate('2026-01-01 00:00:00', offset)).toThrow(RangeError);
  });
});
describe('Appendix 3.1', () => {
  it.each([
    [-22, 'person_not_found'],
    [-23, 'card_in_use'],
    [-24, 'level_not_found'],
    [-27, 'invalid_photo'],
    [-47, 'door_not_found'],
    [-80, 'area_not_found'],
    [-90, 'page_size'],
    [-91, 'page_size'],
    [-92, 'page_size'],
    [-100, 'time_format'],
    [-101, 'time_format'],
    [-5002, 'invalid_photo'],
    [-5018, 'invalid_photo'],
    [-40, 'unknown'],
    [-999, 'unknown'],
  ])('maps %i to %s', (code, reason) => {
    expect(errorReason(Number(code))).toBe(reason);
    expect(new ZkbioApiError(Number(code))).toMatchObject({ code, reason });
  });
});
