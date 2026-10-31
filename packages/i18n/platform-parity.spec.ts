// @fit/i18n — platform (marketing site) catalogue parity guard.
//
// Mirrors `parity.spec.ts` over the per-area platform catalogues in
// `locales/platform/{en,ka}/<area>.json`: every area must carry the same key
// set in both locales and no value may be blank, or a page renders a raw key in
// the locale that lost the string.

import { describe, expect, it } from 'vitest';
import { platformAreas, platformEn, platformKa } from './platform';

/** A single message value — leaf strings, or nested groups of them. */
type MessageNode = string | { [key: string]: MessageNode };

/** Flatten a message tree to a map of dotted key path → leaf string. */
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

const isBlank = (value: string | undefined): boolean => (value ?? '').trim() === '';

describe.each(platformAreas)('platform catalogue parity (en ⇄ ka) — %s', (area) => {
  const flatEn = flatten(platformEn[area]);
  const flatKa = flatten(platformKa[area]);
  const enKeys = Object.keys(flatEn).sort();
  const kaKeys = Object.keys(flatKa).sort();

  it('every English key has a Georgian counterpart', () => {
    const missingInKa = enKeys.filter((key) => !(key in flatKa));
    expect(
      missingInKa,
      `keys present in en/${area} but missing from ka/${area}:\n${missingInKa.join('\n')}`,
    ).toEqual([]);
  });

  it('every Georgian key has an English counterpart', () => {
    const missingInEn = kaKeys.filter((key) => !(key in flatEn));
    expect(
      missingInEn,
      `keys present in ka/${area} but missing from en/${area}:\n${missingInEn.join('\n')}`,
    ).toEqual([]);
  });

  it('the two catalogues have exactly the same key set', () => {
    expect(kaKeys).toEqual(enKeys);
  });

  it('no message value is an empty string in either locale', () => {
    const blank = [
      ...enKeys.filter((key) => isBlank(flatEn[key])).map((key) => `en:${key}`),
      ...kaKeys.filter((key) => isBlank(flatKa[key])).map((key) => `ka:${key}`),
    ];
    expect(blank, `blank message values:\n${blank.join('\n')}`).toEqual([]);
  });
});
