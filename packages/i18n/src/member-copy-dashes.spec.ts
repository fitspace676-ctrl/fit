import { describe, expect, it } from 'vitest';
import en from '../locales/en.json';
import ka from '../locales/ka.json';
import { platformEn, platformKa } from '../platform';

/**
 * No dashes in product copy — anywhere: the member portal, the console and the
 * platform site.
 *
 * Not the typographic em (—) or en (–) dash, not a doubled hyphen, and not a
 * spaced hyphen standing in for one. Sentences use a full stop, colon or comma;
 * ranges are written out ("1 to 12", "1-დან 12-მდე"). A hyphen inside a word —
 * Georgian case endings such as `{to}-მდე`, `check-in` — is spelling, not a dash.
 *
 * The long dashes are indistinguishable from a hyphen at UI sizes but break
 * differently, sort differently, and arrive mangled through anything that is not
 * UTF-8 clean (a CSV export, an SMS gateway, a mail client's plain-text part);
 * in Georgian copy any dash reads as an artefact rather than punctuation.
 */
const DASH = /[—–]|--| - /;

/** Every `path -> string` leaf under `node`. */
function leaves(node: unknown, path: string): [string, string][] {
  if (typeof node === 'string') return [[path, node]];
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
      leaves(value, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

function offenders(catalogue: unknown): string[] {
  return leaves(catalogue, '')
    .filter(([, value]) => DASH.test(value))
    .map(([path, value]) => `${path}: ${value}`);
}

describe('product copy', () => {
  it.each([
    ['en', en],
    ['ka', ka],
    ['platform en', platformEn],
    ['platform ka', platformKa],
  ])('uses no dashes (%s)', (_locale, catalogue) => {
    expect(offenders(catalogue)).toEqual([]);
  });
});
