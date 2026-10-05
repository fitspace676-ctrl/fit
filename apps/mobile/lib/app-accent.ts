// @fit/mobile — the gym's accent colour, remembered between launches.
//
// The colour arrives with the app settings (`GET gyms/by-subdomain/:slug/
// app-settings`, already fetched for the feature switches), so there is no
// request of its own. What this module adds is memory: the last colour a gym's
// settings carried is written to AsyncStorage, read back at boot behind the
// splash (`useAppBootstrap` waits on {@link bootAppAccent}), and so the first
// frame a member sees is already in the gym's colour instead of the built-in
// blue repainting a moment later.
//
// The colour is stored WITH the slug it belongs to and only ever applied for
// that slug, so a device that signs in to a second gym never shows the first
// gym's colour, even for a frame.
//
// Same rules as `lib/theme-preference.ts`: pure, no static native import, so the
// fast Vitest suite covers it. It borrows that module's AsyncStorage adapter
// rather than installing a second one.

import { HEX_COLOR_PATTERN } from '@fit/types';

import { bootThemePreference, getThemePreferenceStorage } from './theme-preference';

/** AsyncStorage key, beside `app_theme` and `app_locale`. */
export const APP_ACCENT_STORAGE_KEY = 'app_accent';

/** A gym's colour, and the gym it is for. */
export interface StoredAppAccent {
  readonly slug: string;
  readonly color: string;
}

/** Narrow a storage read to a usable record; anything else is "no colour". */
export function parseStoredAppAccent(raw: string | null): StoredAppAccent | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as { slug?: unknown; color?: unknown };
    if (
      typeof value.slug === 'string' &&
      value.slug !== '' &&
      typeof value.color === 'string' &&
      HEX_COLOR_PATTERN.test(value.color)
    ) {
      return { slug: value.slug, color: value.color };
    }
  } catch {
    // A corrupt entry is no colour, not a crash at launch.
  }
  return null;
}

/** The colour to paint for `slug`, or `null` for the built-in theme. */
export function appAccentFor(
  stored: StoredAppAccent | null,
  slug: string | null | undefined,
): string | null {
  return stored !== null && slug !== undefined && slug !== null && stored.slug === slug
    ? stored.color
    : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The store — one value, read by `useSyncExternalStore` in the theme provider.
// ─────────────────────────────────────────────────────────────────────────────

let current: StoredAppAccent | null = null;
/** A settings read has answered this session; disk no longer gets a say. */
let delivered = false;
const listeners = new Set<() => void>();

export function getAppAccent(): StoredAppAccent | null {
  return current;
}

export function subscribeAppAccent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: StoredAppAccent | null): boolean {
  if (next?.slug === current?.slug && next?.color === current?.color) return false;
  current = next;
  for (const listener of listeners) listener();
  return true;
}

/**
 * Record what a fresh settings read said about `slug`'s colour: apply it now
 * and persist it for the next launch. `null` (no colour, or no app) forgets it.
 * Write failures are swallowed — the colour still applies to this session.
 */
export async function rememberAppAccent(slug: string, color: string | null): Promise<void> {
  const next = color !== null && HEX_COLOR_PATTERN.test(color) ? { slug, color } : null;
  delivered = true;
  if (!publish(next)) return;
  const storage = getThemePreferenceStorage();
  if (storage === null) return;
  try {
    if (next === null) await storage.deleteItem(APP_ACCENT_STORAGE_KEY);
    else await storage.setItem(APP_ACCENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Cosmetic memory only.
  }
}

let booted: Promise<StoredAppAccent | null> | null = null;

/**
 * Read the remembered colour into the store — once per process, memoised, and
 * never rejecting: an unreadable store is the built-in theme, not a hung splash.
 * Whatever a settings read has already delivered is not overwritten by disk.
 */
export function bootAppAccent(): Promise<StoredAppAccent | null> {
  booted ??= bootThemePreference()
    .then(async () => {
      const storage = getThemePreferenceStorage();
      if (storage === null) return null;
      return parseStoredAppAccent(await storage.getItem(APP_ACCENT_STORAGE_KEY));
    })
    .catch(() => null)
    .then((stored) => {
      if (!delivered && stored !== null) publish(stored);
      return stored;
    });
  return booted;
}

/** Forget the memo and the store. Specs only — the app boots once. */
export function resetAppAccent(): void {
  booted = null;
  current = null;
  delivered = false;
  listeners.clear();
}
