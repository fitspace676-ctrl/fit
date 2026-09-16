// @fit/mobile — plural arithmetic and ICU plural rendering.
//
// The catalogues carry *two* plural conventions, because they were written by
// two surfaces:
//
//   1. **ICU** — `"{count, plural, one {# class} other {# classes}}"`. next-intl
//      renders this on web. There is no such renderer on the phone, so a flat
//      `{name}` substitution would put that literal string on screen.
//   2. **Sibling pairs** — `training.packages.sessionsOne` /
//      `…sessionsOther`, five of them, added for a runtime with no ICU. Picking
//      the wrong one ships "1 sessions left".
//
// Both are failures the design system cannot catch: `packages/ui-mobile` takes
// every label as a required prop, so whatever this module returns is what the
// user reads. This module handles (1); `resolve.ts` composes it with (2).
//
// Deliberately no `Intl.PluralRules`: Hermes' ICU is smaller than a browser's
// and carries no Georgian data, so it would silently answer with English rules.
// The two locales the platform ships share one CLDR cardinal rule anyway, and it
// is two lines.

import type { Locale } from '@fit/i18n';

/** The CLDR cardinal categories. Only `one` and `other` are reachable today. */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/**
 * The CLDR cardinal category for `count`.
 *
 * `ka` and `en` share the rule `one ⇔ i = 1 and v = 0` — i.e. the integer 1 (or
 * -1), and nothing else; `1.0` typed as a JS number *is* the integer 1 and so is
 * `one`, while `1.5` is `other`. `locale` is taken but unused for exactly that
 * reason, and is the parameter a third locale would branch on: if `ru` (which
 * has `one/few/many/other`) is ever added, this function is the one place that
 * has to change, and its callers already handle a wider return type.
 */
export function pluralCategory(count: number, _locale?: Locale): PluralCategory {
  return Number.isInteger(count) && Math.abs(count) === 1 ? 'one' : 'other';
}

/**
 * The `…One` / `…Other` suffix for the sibling-key convention. Capitalised
 * because the catalogue keys are camelCase (`sessionsOne`, not `sessions.one`).
 */
export function pluralSuffix(count: number, locale?: Locale): 'One' | 'Other' {
  return pluralCategory(count, locale) === 'one' ? 'One' : 'Other';
}

/** One parsed `{arg, plural, …}` block. */
interface PluralBlock {
  /** Index just past the block's closing `}`. */
  readonly end: number;
  /** The argument name the block switches on (`count`, `days`, `areas`, …). */
  readonly arg: string;
  /** Selector → branch body, e.g. `{ '=0': 'No rows', one: '# row' }`. */
  readonly branches: Readonly<Record<string, string>>;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isSpace(char: string | undefined): boolean {
  return char !== undefined && (char === ' ' || char === '\t' || char === '\n' || char === '\r');
}

/**
 * Parse a `{arg, plural, sel {body} …}` block starting at `start`.
 *
 * Returns `null` for anything that is not one — a plain `{name}` placeholder, a
 * `select` block, an `offset:` form, or a malformed block. The caller then
 * copies the text through untouched, which is the right failure: a message
 * rendered verbatim is visibly wrong in review, whereas a message rendered with
 * a *guessed* branch is wrong only for some counts, in production.
 */
function parsePluralBlock(source: string, start: number): PluralBlock | null {
  if (source[start] !== '{') return null;

  const firstComma = source.indexOf(',', start);
  if (firstComma === -1) return null;
  const arg = source.slice(start + 1, firstComma).trim();
  if (!IDENTIFIER.test(arg)) return null;

  const secondComma = source.indexOf(',', firstComma + 1);
  if (secondComma === -1) return null;
  if (source.slice(firstComma + 1, secondComma).trim() !== 'plural') return null;

  const branches: Record<string, string> = {};
  let index = secondComma + 1;

  while (index < source.length) {
    while (isSpace(source[index])) index += 1;
    if (source[index] === '}') {
      return Object.keys(branches).length > 0 ? { end: index + 1, arg, branches } : null;
    }

    const selectorStart = index;
    while (index < source.length) {
      const char = source[index];
      if (char === undefined || isSpace(char) || char === '{' || char === '}') break;
      index += 1;
    }
    const selector = source.slice(selectorStart, index);
    if (selector === '') return null;

    while (isSpace(source[index])) index += 1;
    if (source[index] !== '{') return null;

    // Walk the branch body with a brace counter so a nested `{name}` inside it
    // does not terminate the branch early.
    const bodyStart = index + 1;
    let depth = 0;
    while (index < source.length) {
      const char = source[index];
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
      index += 1;
    }
    if (depth !== 0) return null;

    branches[selector] = source.slice(bodyStart, index);
    index += 1;
  }

  return null;
}

/**
 * Choose a branch: an exact `=N` match first (`=0 {No rows}` beats `other`),
 * then the CLDR category, then `other` as the guaranteed fallback.
 */
export function selectPluralBranch(
  branches: Readonly<Record<string, string>>,
  count: number,
  locale?: Locale,
): string | undefined {
  return branches[`=${count}`] ?? branches[pluralCategory(count, locale)] ?? branches['other'];
}

/**
 * Render every `{arg, plural, …}` block in `message` whose argument is present
 * in `params` as a number, replacing `#` inside the chosen branch with the
 * count. Anything else is copied through verbatim — including `{name}`
 * placeholders, which `interpolate` handles afterwards.
 *
 * Blocks can be embedded in surrounding text and there can be more than one, so
 * this scans rather than matching the whole string:
 * `"{count, plural, one {# item} other {# items}} · {method}"`.
 */
export function formatIcuPlurals(
  message: string,
  params?: Readonly<Record<string, string | number>>,
  locale?: Locale,
): string {
  // Fast path: an ICU plural block needs at least `{x,plural,y{z}}`, and every
  // one contains a comma. Most messages have none.
  if (params === undefined || !message.includes(',')) return message;

  let out = '';
  let index = 0;

  while (index < message.length) {
    const open = message.indexOf('{', index);
    if (open === -1) {
      out += message.slice(index);
      return out;
    }
    out += message.slice(index, open);

    const block = parsePluralBlock(message, open);
    if (block === null) {
      out += '{';
      index = open + 1;
      continue;
    }

    const count = params[block.arg];
    if (typeof count !== 'number') {
      out += message.slice(open, block.end);
      index = block.end;
      continue;
    }

    const branch = selectPluralBranch(block.branches, count, locale);
    out += (branch ?? '').replaceAll('#', String(count));
    index = block.end;
  }

  return out;
}

/**
 * Whether `message` contains an ICU plural block this module would render.
 * Used by the catalogue guard spec to assert the parser covers every one of
 * them, so a newly-authored ICU message cannot reach a screen unrendered.
 */
export function hasIcuPlural(message: string): boolean {
  for (let index = message.indexOf('{'); index !== -1; index = message.indexOf('{', index + 1)) {
    if (parsePluralBlock(message, index) !== null) return true;
  }
  return false;
}
