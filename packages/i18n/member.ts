// @fit/i18n/member — the member-facing slice of the message catalogues.
//
// Why this exists: `./index` exports `messages`, which is *both* full
// catalogues — 3509 keys, of which `admin` alone is 2411 (69%) and `home` /
// `footer` are the public marketing site. None of that is reachable from the
// phone, and the mobile app has no code-splitting to shed it later: whatever the
// entry graph touches is in the JS bundle at launch. This module names the
// namespaces the member surfaces actually use, so `apps/mobile` imports a
// 1044-key object instead of a 3509-key one. A lint rule in
// `apps/mobile/eslint.config.mjs` bans the `messages` / `en` / `ka` imports
// outright so the boundary cannot be crossed by accident.
//
// ⚠️ KNOWN LIMIT — this trims the *object*, not yet the *bytes*. Metro bundles
// a JSON import as one module, so the two `import … from './locales/*.json'`
// lines below still pull all ~270 KB of catalogue into the app binary even
// though 71% of it is unreachable. Removing those bytes needs pre-split JSON
// files emitted by a codegen step (plus a drift guard); that is deliberately not
// done here, because a generated catalogue checked into `locales/` would break
// every parallel branch that authors a key until it is regenerated. The runtime
// slice + the lint boundary land first; the codegen is a mechanical follow-up
// that changes only the two imports in this file.
//
// The catalogues themselves stay the single source of truth — this file picks
// from them, it never redeclares a key, so web and mobile can never drift.

import type { Locale } from './index';
import en from './locales/en.json';
import ka from './locales/ka.json';

/**
 * Top-level namespaces reachable from the member (mobile + member web) surfaces.
 *
 * Sorted alphabetically so a diff adding one is a one-line diff. Verified
 * against the catalogues rather than assumed: everything not listed here is
 * `admin` (2411 keys), `home` (42 — the marketing landing page; the mobile home
 * tab is `member.home`) or `footer` (12 — the public site chrome).
 */
export const memberNamespaces = [
  'account',
  'auth',
  'billing',
  'checkout',
  'classes',
  'common',
  'errors',
  'member',
  'notifications',
  'onboarding',
  'qr',
  'services',
  'settings',
  'shop',
  'trainers',
  'training',
] as const;

/** A top-level namespace the member surfaces may read. */
export type MemberNamespace = (typeof memberNamespaces)[number];

/**
 * Shape of the member slice of a catalogue, derived from the EN source so it
 * cannot drift from the JSON. This is the type a client derives its key union
 * from — see `apps/mobile/lib/i18n/keys.ts`.
 */
export type MemberMessages = Pick<typeof en, MemberNamespace>;

/** Narrow an arbitrary string to a {@link MemberNamespace}. */
export function isMemberNamespace(value: string): value is MemberNamespace {
  return (memberNamespaces as readonly string[]).includes(value);
}

function sliceCatalogue(catalogue: typeof en): MemberMessages {
  const out: Partial<Record<MemberNamespace, unknown>> = {};
  for (const namespace of memberNamespaces) {
    out[namespace] = catalogue[namespace];
  }
  return out as MemberMessages;
}

/** The member slice of the English catalogue. */
export const memberEn: MemberMessages = sliceCatalogue(en);

/**
 * The member slice of the Georgian catalogue.
 *
 * This type-checks only because the two catalogues are structurally identical —
 * which `parity.spec.ts` asserts on every run. If someone adds a key to one and
 * not the other, this line stops compiling before the spec even gets a chance to
 * fail, which is the cheaper of the two signals.
 */
export const memberKa: MemberMessages = sliceCatalogue(ka);

/** Member message catalogues keyed by locale — the mobile app's `messages`. */
export const memberMessages: Record<Locale, MemberMessages> = {
  ka: memberKa,
  en: memberEn,
};
