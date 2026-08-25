import { describe, expect, it } from 'vitest';
import en from '../locales/en.json';
import ka from '../locales/ka.json';

/**
 * Member-portal copy uses the plain hyphen, never the typographic em (—) or en
 * (–) dash.
 *
 * The two long dashes are indistinguishable from a hyphen at UI sizes but break
 * differently, sort differently, and arrive mangled through anything that is not
 * UTF-8 clean (a CSV export, an SMS gateway, a mail client's plain-text part).
 * The portal's Georgian copy is the common case, and there a long dash reads as
 * an artefact rather than punctuation.
 *
 * Scoped to the namespaces `apps/web` actually renders — the console has its own
 * copy and is not covered here.
 */

/** The top-level namespaces the member portal reads (grep `useTranslations` in apps/web). */
const MEMBER_NAMESPACES = [
  'account',
  'auth',
  'checkout',
  'classes',
  'common',
  'errors',
  'footer',
  'home',
  'member',
  'services',
  'shop',
  'trainers',
] as const;

const LONG_DASH = /[—–]/;

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

function offenders(catalogue: Record<string, unknown>): string[] {
  return MEMBER_NAMESPACES.flatMap((ns) => leaves(catalogue[ns], ns))
    .filter(([, value]) => LONG_DASH.test(value))
    .map(([path, value]) => `${path}: ${value}`);
}

describe('member portal copy', () => {
  it.each([
    ['en', en],
    ['ka', ka],
  ])('uses a plain hyphen, never an em or en dash (%s)', (_locale, catalogue) => {
    expect(offenders(catalogue as Record<string, unknown>)).toEqual([]);
  });
});

/**
 * Console namespaces held to the same rule. The console's older copy predates it,
 * so this list grows one feature at a time rather than covering `admin.*` wholesale.
 */
const CONSOLE_NAMESPACES = ['admin.services', 'admin.pos.products'] as const;

/** The subtree at a dotted `path`, e.g. `admin.services`. */
function at(catalogue: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) => (node as Record<string, unknown> | undefined)?.[key],
      catalogue,
    );
}

describe('console copy (services, POS catalogue)', () => {
  it.each([
    ['en', en],
    ['ka', ka],
  ])('uses a plain hyphen, never an em or en dash (%s)', (_locale, catalogue) => {
    const found = CONSOLE_NAMESPACES.flatMap((ns) =>
      leaves(at(catalogue as Record<string, unknown>, ns), ns),
    )
      .filter(([, value]) => LONG_DASH.test(value))
      .map(([path, value]) => `${path}: ${value}`);
    expect(found).toEqual([]);
  });
});
