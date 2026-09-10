// @fit/mobile — key → rendered string.
//
// Everything the user reads on the phone comes through here. `packages/ui-mobile`
// ships zero copy by design (every label is a required prop), so this module is
// the *only* place a string can be produced, which is why it is a pure module
// with no React and no `react-native` import: it runs in the fast Vitest suite
// (§5) and the provider above it is a twenty-line shell.
//
// Layering: this file depends on `plural.ts`, never the reverse. `plural.ts` is
// plural arithmetic and ICU rendering with no notion of a catalogue; this file
// knows catalogues, dot paths and fallbacks. `translatePlural` lives here rather
// than in `plural.ts` for that reason — it is a *lookup* (it tries three keys),
// and putting it the other side of the boundary would make the two modules
// mutually recursive.

import { defaultLocale, type Locale } from '@fit/i18n';
import { formatIcuPlurals, pluralSuffix } from './plural';

/** A message catalogue: nested groups of leaf strings. */
export type MessageTree = { readonly [key: string]: string | MessageTree };

/** Catalogues keyed by locale, as `@fit/i18n/member` exports them. */
export type Catalogues = Readonly<Record<Locale, MessageTree>>;

/** Interpolation arguments for a message. */
export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * Resolve a dot-path (`"member.profile.mobile.title"`) to a leaf string.
 *
 * Returns `undefined` — never `"[object Object]"` — when the path names a
 * *group* rather than a leaf (`t('qr')`), when a segment is missing, or when a
 * segment tries to walk *through* a string. Rendering a group's JSON at a user
 * is the failure mode this guard exists for.
 */
export function resolveMessage(tree: MessageTree | undefined, path: string): string | undefined {
  if (tree === undefined || path === '') return undefined;

  let node: string | MessageTree | undefined = tree;
  for (const segment of path.split('.')) {
    if (typeof node !== 'object') return undefined;
    node = node[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Substitute `{name}` placeholders. Every occurrence is replaced, so a message
 * naming the same argument twice ("{name} — buy {name}?") renders both.
 * Placeholders with no matching argument are left as written, which makes the
 * omission visible in review rather than silently blanking the sentence.
 */
export function interpolate(message: string, params?: MessageParams): string {
  if (params === undefined || !message.includes('{')) return message;

  let out = message;
  for (const [name, value] of Object.entries(params)) {
    out = out.replaceAll(`{${name}}`, String(value));
  }
  return out;
}

/**
 * Render a raw catalogue string: ICU plural blocks first (so `#` and branch
 * selection happen against the real count), then flat `{name}` substitution
 * over whatever the chosen branch spliced in.
 */
export function formatMessage(message: string, params?: MessageParams, locale?: Locale): string {
  return interpolate(formatIcuPlurals(message, params, locale), params);
}

/**
 * Called with every key that resolves in neither locale. Not wired by default —
 * the provider installs a `console.warn` in development. Production stays
 * silent: a raw key on screen is already the loudest possible signal, and the
 * typed `MessageKey` union means this can only fire for a dynamically-built key.
 */
let missingHandler: ((key: string, locale: Locale) => void) | null = null;

/** Install (or clear, with `null`) the missing-key reporter. */
export function setMissingMessageHandler(
  handler: ((key: string, locale: Locale) => void) | null,
): void {
  missingHandler = handler;
}

function reportMissing(key: string, locale: Locale): string {
  missingHandler?.(key, locale);
  return key;
}

/**
 * Translate `key` in `locale`.
 *
 * Fallback chain, in order: the active locale → the default locale (`ka`) → the
 * raw key. The middle step matters more on mobile than on web — an app update
 * ships the catalogue, so a key added for one locale in a hurry renders the
 * other locale's copy rather than a dot-path.
 */
export function translate(
  catalogues: Catalogues,
  locale: Locale,
  key: string,
  params?: MessageParams,
): string {
  const message =
    resolveMessage(catalogues[locale], key) ??
    (locale === defaultLocale ? undefined : resolveMessage(catalogues[defaultLocale], key));

  if (message === undefined) return reportMissing(key, locale);
  return formatMessage(message, params, locale);
}

/**
 * Translate the plural form of `baseKey` for `count`.
 *
 * Three shapes are accepted, tried in this order, because the catalogues carry
 * all three:
 *
 *   1. `baseKey + 'One' | 'Other'` — the sibling pair convention
 *      (`training.packages.sessionsOne`). Five pairs exist today.
 *   2. `baseKey` itself holding an ICU block
 *      (`classes.detail.minutes` = `"{count, plural, one {# minute} …}"`).
 *      These are the keys web already renders through next-intl; picking them up
 *      here is what stops the ICU source appearing on screen.
 *   3. `baseKey` as a plain message — degrades to `translate`, so a caller that
 *      guesses wrong gets the singular text rather than a raw dot-path.
 *
 * `count` is always injected as the `count` argument (an explicit `params.count`
 * wins), because every pair in the catalogues writes its number as `{count}`.
 */
export function translatePlural(
  catalogues: Catalogues,
  locale: Locale,
  baseKey: string,
  count: number,
  params?: MessageParams,
): string {
  const withCount: MessageParams = { count, ...params };
  const suffixed = `${baseKey}${pluralSuffix(count, locale)}`;

  const sibling =
    resolveMessage(catalogues[locale], suffixed) ??
    (locale === defaultLocale ? undefined : resolveMessage(catalogues[defaultLocale], suffixed));

  if (sibling !== undefined) return formatMessage(sibling, withCount, locale);

  return translate(catalogues, locale, baseKey, withCount);
}
