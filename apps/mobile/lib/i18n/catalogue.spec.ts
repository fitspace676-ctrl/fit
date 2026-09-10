// The catalogue guard.
//
// `packages/i18n/parity.spec.ts` already checks the *whole* catalogue for en/ka
// key parity. This file is the mobile-specific half: it walks only the slice the
// phone ships and asserts the properties this runtime depends on — that both
// locales carry every key, that every plural pair is complete in both, that
// every ICU block the copy authors write can actually be rendered by
// `plural.ts`, and that a Georgian string never quietly drops the `{count}` its
// English twin interpolates.
//
// Every assertion here is a walk over both trees, not a spot check: today's
// parity is *kept*, not assumed. The numbers in the counts test are the
// WP-16 coverage audit, pinned so a namespace cannot be added to the member
// bundle without someone noticing the phone got bigger.

import { memberMessages, memberNamespaces } from '@fit/i18n/member';
import { describe, expect, it } from 'vitest';
import { formatIcuPlurals, hasIcuPlural } from './plural';
import { resolveMessage, type MessageTree } from './resolve';

const ka = memberMessages.ka as unknown as MessageTree;
const en = memberMessages.en as unknown as MessageTree;

/** Flatten a tree to `dotted.path → leaf string`. */
function flatten(node: MessageTree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

const flatEn = flatten(en);
const flatKa = flatten(ka);
const enKeys = Object.keys(flatEn).sort();
const kaKeys = Object.keys(flatKa).sort();

/**
 * The arguments a message consumes: the argument of every ICU plural block,
 * plus every flat `{name}` placeholder outside one. Blocks are rendered away
 * first so a branch body like `=1 {day}` is not mistaken for a `{day}`
 * placeholder — the trap that makes the naive regex version of this test lie.
 */
function messageArgs(message: string): string[] {
  const icuArgs = [...message.matchAll(/\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*plural\s*,/g)].flatMap(
    (match) => (match[1] === undefined ? [] : [match[1]]),
  );

  const rendered = formatIcuPlurals(message, Object.fromEntries(icuArgs.map((arg) => [arg, 2])));
  const flat = [...rendered.matchAll(/\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );

  return [...new Set([...icuArgs, ...flat])].sort();
}

describe('the member slice', () => {
  it('carries only the namespaces the phone can reach', () => {
    expect(Object.keys(en).sort()).toEqual([...memberNamespaces].sort());
  });

  it('leaves the admin console and the marketing site behind', () => {
    for (const namespace of ['admin', 'home', 'footer']) {
      expect(Object.keys(en)).not.toContain(namespace);
    }
  });

  it('is the size the coverage audit measured', () => {
    // 3797 keys in the full catalogue → 1125 here. Change these numbers only
    // alongside a deliberate decision about what ships on the phone.
    //
    // Last moved by the join funnel's start-date week strip: `auth.login
    // .noAccount` / `.registerLink` went (the login screen offered the join
    // funnel twice, and `/register` was the wrong half of it), and
    // `checkout.details.calendar` gained `previousWeek` / `nextWeek` / `today`
    // / `unavailable` for the strip's spoken labels. Net +2.
    //
    // 2026-09-10, the P1 mobile backlog: 1087 → 1125. The QR scanner
    // (`qr.scanner.*`), the shop's orders tab (`member.shop.tabs` /
    // `.orders` / `.order.detailTitle`), the home banners and trainers rails
    // (`member.home.banners` / `.trainers`), the profile's appearance and menu
    // blocks (`member.profile.mobile.appearance` / `.menu`) and
    // `billing.subtitle` all landed on the phone in one sweep.
    expect(enKeys).toHaveLength(1125);
    expect(kaKeys).toHaveLength(1125);
  });
});

describe('en ⇄ ka parity across every screen-facing key', () => {
  it('every English key has a Georgian counterpart', () => {
    const missing = enKeys.filter((key) => !(key in flatKa));
    expect(missing, `present in en, missing from ka:\n${missing.join('\n')}`).toEqual([]);
  });

  it('every Georgian key has an English counterpart', () => {
    const missing = kaKeys.filter((key) => !(key in flatEn));
    expect(missing, `present in ka, missing from en:\n${missing.join('\n')}`).toEqual([]);
  });

  it('the two key sets are identical', () => {
    expect(kaKeys).toEqual(enKeys);
  });

  it('no message is blank in either locale', () => {
    const blank = enKeys.filter(
      (key) => (flatEn[key] ?? '').trim() === '' || (flatKa[key] ?? '').trim() === '',
    );
    expect(blank, `blank messages:\n${blank.join('\n')}`).toEqual([]);
  });

  it('resolves through the runtime, not just the raw tree', () => {
    for (const key of enKeys) {
      expect(resolveMessage(en, key), key).toBeTypeOf('string');
      expect(resolveMessage(ka, key), key).toBeTypeOf('string');
    }
  });

  it('interpolates the same arguments in both locales', () => {
    // A Georgian string that drops `{count}` renders a sentence with no number
    // in it — silently, and only for Georgian users, which is everyone.
    const drifted = enKeys.filter(
      (key) =>
        messageArgs(flatEn[key] ?? '').join(',') !== messageArgs(flatKa[key] ?? '').join(','),
    );
    expect(
      drifted,
      drifted
        .map((key) => `${key}\n    en: ${flatEn[key] ?? ''}\n    ka: ${flatKa[key] ?? ''}`)
        .join('\n'),
    ).toEqual([]);
  });
});

describe('plural pairs', () => {
  const bases = [
    ...new Set(
      enKeys.flatMap((key) => {
        if (key.endsWith('One')) return [key.slice(0, -3)];
        if (key.endsWith('Other')) return [key.slice(0, -5)];
        return [];
      }),
    ),
  ].sort();

  it('is the set the audit found', () => {
    expect(bases).toEqual([
      'billing.credits.sessions',
      'classes.card.spotsLeft',
      'classes.listView.items',
      'member.profile.mobile.pt.sessionsLeft',
      'training.packages.sessions',
    ]);
  });

  it('has both halves, in both locales — a lone …One would ship "1 sessions"', () => {
    for (const base of bases) {
      for (const [name, flat] of [
        ['en', flatEn],
        ['ka', flatKa],
      ] as const) {
        expect(flat[`${base}One`], `${name}:${base}One`).toBeTypeOf('string');
        expect(flat[`${base}Other`], `${name}:${base}Other`).toBeTypeOf('string');
      }
    }
  });

  it('writes its number as {count} in both halves and both locales', () => {
    for (const base of bases) {
      for (const flat of [flatEn, flatKa]) {
        expect(flat[`${base}One`]).toContain('{count}');
        expect(flat[`${base}Other`]).toContain('{count}');
      }
    }
  });
});

describe('ICU plural blocks', () => {
  const icuKeys = enKeys.filter(
    (key) =>
      /\{\s*\w+\s*,\s*plural\s*,/.test(flatEn[key] ?? '') ||
      /\{\s*\w+\s*,\s*plural\s*,/.test(flatKa[key] ?? ''),
  );

  it('exist — web writes them, so the phone has to render them', () => {
    // Nine today. These are the keys that would put raw ICU source on screen
    // if `plural.ts` did not parse it.
    expect(icuKeys.length).toBeGreaterThanOrEqual(9);
  });

  it('are all parseable by the renderer, in both locales', () => {
    for (const key of icuKeys) {
      for (const [name, flat] of [
        ['en', flatEn],
        ['ka', flatKa],
      ] as const) {
        const message = flat[key] ?? '';
        if (!/\{\s*\w+\s*,\s*plural\s*,/.test(message)) continue;
        expect(hasIcuPlural(message), `${name}:${key} — ${message}`).toBe(true);
      }
    }
  });

  it('leave no brace-comma construct unrendered once the arguments are supplied', () => {
    for (const key of enKeys) {
      for (const flat of [flatEn, flatKa]) {
        const message = flat[key] ?? '';
        const args = Object.fromEntries(messageArgs(message).map((arg) => [arg, 2]));
        const rendered = formatIcuPlurals(message, args);
        expect(rendered, `${key} — ${message}`).not.toMatch(/\{\s*\w+\s*,/);
      }
    }
  });

  it('uses no ICU form beyond `plural` — no `select`, no `offset:`', () => {
    for (const key of enKeys) {
      for (const flat of [flatEn, flatKa]) {
        const message = flat[key] ?? '';
        expect(message, key).not.toMatch(/\{\s*\w+\s*,\s*select\s*,/);
        expect(message, key).not.toContain('offset:');
      }
    }
  });
});
