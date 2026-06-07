// @fit/mobile — local notification preferences (store + persistence).
//
// What the member wants to be notified about. These are *preferences*, not
// secrets, so they live in AsyncStorage. Actual push delivery (registering the
// Expo push token, honouring these flags server-side) lands in T6.10 — until
// then this is the single source of truth the Settings UI reads and writes, and
// the gate a later delivery layer will consult.
//
// Like `auth-storage`, it keeps an in-memory snapshot with a tiny pub/sub so
// React (via `useSyncExternalStore`) re-renders the instant a toggle flips,
// without re-reading AsyncStorage on every render.

import AsyncStorage from '@react-native-async-storage/async-storage';

/** AsyncStorage key under which the preferences JSON is persisted. */
const PREFS_STORAGE_KEY = 'fit.notificationPrefs';

/** The member's notification preferences. */
export interface NotificationPrefs {
  /** Master switch — when off, the category toggles are moot (and disabled in UI). */
  push: boolean;
  /** Reminders before a booked class starts. */
  classReminders: boolean;
  /** Waitlist promotions, cancellations, and other booking changes. */
  bookingUpdates: boolean;
  /** Offers and news from the member's gym. */
  promotions: boolean;
}

/** Sensible defaults: push + the two transactional categories on, marketing off. */
export const DEFAULT_PREFS: NotificationPrefs = {
  push: true,
  classReminders: true,
  bookingUpdates: true,
  promotions: false,
};

// In-memory mirror of the persisted prefs + subscribers. The reference only
// changes on save / hydrate, which is what keeps `useSyncExternalStore` stable.
let cachedPrefs: NotificationPrefs = DEFAULT_PREFS;
let hydrated = false;
const subscribers = new Set<() => void>();

function emit(): void {
  for (const notify of subscribers) notify();
}

/** Subscribe to preference changes (save / hydrate). Returns an unsubscribe. */
export function subscribePrefs(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/** The last-known preferences without touching AsyncStorage (defaults until hydrated). */
export function getPrefsSnapshot(): NotificationPrefs {
  return cachedPrefs;
}

/** Coerce an arbitrary parsed value into a complete {@link NotificationPrefs}. */
function normalize(value: unknown): NotificationPrefs {
  if (typeof value !== 'object' || value === null) return DEFAULT_PREFS;
  const raw = value as Partial<Record<keyof NotificationPrefs, unknown>>;
  const pick = (key: keyof NotificationPrefs): boolean =>
    typeof raw[key] === 'boolean' ? raw[key] : DEFAULT_PREFS[key];
  return {
    push: pick('push'),
    classReminders: pick('classReminders'),
    bookingUpdates: pick('bookingUpdates'),
    promotions: pick('promotions'),
  };
}

/**
 * Load the persisted preferences into the in-memory snapshot once at startup, so
 * the Settings screens render the saved choice without a flash of defaults.
 * Idempotent: subsequent calls return the cached snapshot.
 */
export async function hydratePrefs(): Promise<NotificationPrefs> {
  if (hydrated) return cachedPrefs;
  const stored = await AsyncStorage.getItem(PREFS_STORAGE_KEY).catch(() => null);
  if (stored) {
    try {
      cachedPrefs = normalize(JSON.parse(stored));
    } catch {
      cachedPrefs = DEFAULT_PREFS;
    }
  }
  hydrated = true;
  emit();
  return cachedPrefs;
}

/**
 * Apply a partial update, persist it, and notify subscribers. Returns the merged
 * preferences. The write is best-effort — a storage failure still updates the
 * in-memory snapshot so the UI stays responsive.
 */
export async function updatePrefs(patch: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
  cachedPrefs = { ...cachedPrefs, ...patch };
  hydrated = true;
  emit();
  await AsyncStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(cachedPrefs)).catch(() => undefined);
  return cachedPrefs;
}
