// @fit/mobile — the typed key space.
//
// The defect this closes: `t()` used to be `(key: string)`, so a typo rendered
// the raw dot-path on screen and nothing in CI noticed. That is how the deleted
// app shipped screens showing `member.profile.mobile.stats.dayStreak` to users.
// Deriving the union from the catalogue type makes it a `pnpm type-check`
// failure instead.
//
// Cost, measured on this repo rather than guessed (`tsc --extendedDiagnostics`,
// apps/mobile, before → after adding this file): types 122,003 → 136,978,
// instantiations 450,062 → 470,605, memory 403 MB → 420 MB, check time 0.88s →
// 0.87s. A 1044-member union is free at this size, so no namespace-scoped
// compromise was needed. It would not be free over the *full* 3509-key
// catalogue, which is a second reason `@fit/i18n/member` exists.

import type { MemberMessages } from '@fit/i18n/member';

type Join<Head extends string, Tail extends string> = Tail extends '' ? Head : `${Head}.${Tail}`;

/** Every dot-path from `T` down to a leaf string. */
type LeafPaths<T> = T extends string
  ? ''
  : { [K in keyof T & string]: Join<K, LeafPaths<T[K]>> }[keyof T & string];

/**
 * Every message key the member app can render — 1044 of them, exactly the leaves
 * of `@fit/i18n/member`. A key that does not exist is a compile error naming the
 * near misses.
 */
export type MessageKey = LeafPaths<MemberMessages>;

/**
 * The base half of an `…One` / `…Other` sibling pair, e.g.
 * `'training.packages.sessions'`. Not a `MessageKey` — neither half of the pair
 * is spelled that way — so `plural()` accepts this union *in addition to*
 * `MessageKey`.
 */
export type PluralSiblingKey = MessageKey extends infer K
  ? K extends `${infer Base}One`
    ? Base
    : never
  : never;

/**
 * What `plural()` accepts: a sibling base (shape 1) or a real key holding an ICU
 * block (shape 2). See `translatePlural`.
 *
 * ⚠️ This is *narrower* than the `(baseKey: string)` in the work-package brief —
 * a deliberate deviation, flagged in the report. Every call site in the
 * catalogues is covered by one of the two arms; the only thing it rejects is a
 * key that does not exist, which is the whole point of the typed key space. A
 * genuinely dynamic key can still go through `t()` with a widening cast.
 */
export type PluralKey = MessageKey | PluralSiblingKey;
