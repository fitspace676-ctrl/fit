// @fit/i18n — locale-catalogue parity guard.
//
// The platform ships two locales (`ka`, `en`) and every UI string must exist in
// both, or a screen renders a raw key (or next-intl throws) in the locale that
// is missing it. This test is the automated backstop for the "all new UI strings
// have en + ka i18n keys — no hardcoded text" requirement: whenever a feature
// adds a string to one catalogue and forgets the other, the flattened key sets
// diverge and this fails, naming the offending keys.

import { describe, expect, it } from 'vitest';
import { en, ka } from './index';

/** A single message value — leaf strings, or nested groups of them. */
type MessageNode = string | { [key: string]: MessageNode };

/**
 * Flatten a message catalogue to a map of dotted key path → leaf string, so two
 * catalogues can be compared by key set and by value type regardless of nesting.
 */
function flatten(node: MessageNode, prefix = ''): Record<string, string> {
  if (typeof node === 'string') {
    return { [prefix]: node };
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    Object.assign(out, flatten(value, path));
  }
  return out;
}

const flatEn = flatten(en);
const flatKa = flatten(ka);
const enKeys = Object.keys(flatEn).sort();
const kaKeys = Object.keys(flatKa).sort();

describe('locale catalogue parity (en ⇄ ka)', () => {
  it('every English key has a Georgian counterpart', () => {
    const missingInKa = enKeys.filter((key) => !(key in flatKa));
    expect(
      missingInKa,
      `keys present in en but missing from ka:\n${missingInKa.join('\n')}`,
    ).toEqual([]);
  });

  it('every Georgian key has an English counterpart', () => {
    const missingInEn = kaKeys.filter((key) => !(key in flatEn));
    expect(
      missingInEn,
      `keys present in ka but missing from en:\n${missingInEn.join('\n')}`,
    ).toEqual([]);
  });

  it('the two catalogues have exactly the same key set', () => {
    expect(kaKeys).toEqual(enKeys);
  });

  it('no message value is an empty string in either locale', () => {
    const isBlank = (value: string | undefined): boolean => (value ?? '').trim() === '';
    const blank = [
      ...enKeys.filter((key) => isBlank(flatEn[key])).map((key) => `en:${key}`),
      ...kaKeys.filter((key) => isBlank(flatKa[key])).map((key) => `ka:${key}`),
    ];
    expect(blank, `blank message values:\n${blank.join('\n')}`).toEqual([]);
  });
});
