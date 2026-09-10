// @fit/mobile — light or dark, and where that choice lives.
//
// Two inputs, not three: the user's persisted choice, then the product default
// (`dark`). The OS is deliberately NOT one of them — see below.
//
// Written to the same rules as `lib/locale.ts`, and for the same reason: the
// interesting parts are pure functions taking their inputs as arguments, so the
// priority order and the hydration race are unit-testable without a renderer,
// and nothing here statically imports a native module (§5 — that would drag the
// file and its spec out of the fast Vitest suite). Storage is an injected
// adapter installed at boot through an indirected dynamic import.
//
// A missing store is not fatal, exactly as with the locale: no store means the
// app is dark, which is the correct default and not worth a crash at launch.
//
// ---------------------------------------------------------------------------
// WHY THERE IS NO `'system'`.
//
// `ThemeProvider` accepts `scheme="system"` and it works, but the product
// decision (2026-09-09) is the member portal's: an explicit two-way switch,
// light or dark, defaulting to dark. A third "follows system" option makes the
// control answer a question the other two already answered — and it is the
// option that makes a member's phone, not the member, decide what the gym app
// looks like. `settings.preferences.appearanceSystem` and
// `member.profile.mobile.menu.appearanceHint` still carry a "Follows system"
// string from the deleted app; both are unused, and this is why.

/**
 * The two modes the app ships. Not `ThemeScheme` from `@fit/ui-mobile` — that
 * type includes `'system'`, which this preference deliberately excludes, and
 * importing it here would also pull the kit into the fast suite.
 */
export type ThemePreference = 'light' | 'dark';

/** Dark is the product: every artboard is dark and the splash is `#131312`. */
export const defaultThemePreference: ThemePreference = 'dark';

/** Narrow an arbitrary string — a storage read, a deep link — to a mode. */
export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark';
}

/**
 * The two operations a preference needs. Same shape as `LocaleStorageAdapter`,
 * so the app hands both the same AsyncStorage backend; like the locale and
 * unlike the session, this is not a secret and does not belong in the Keychain.
 */
export interface ThemeStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

/** AsyncStorage key, alongside `app_locale`. */
export const THEME_PREFERENCE_STORAGE_KEY = 'app_theme';

let storage: ThemeStorageAdapter | null = null;

/** Install (or clear, with `null`) the preference store. Called at boot and by specs. */
export function setThemePreferenceStorage(adapter: ThemeStorageAdapter | null): void {
  storage = adapter;
}

/** The installed store, or `null` — callers degrade to dark rather than throw. */
export function getThemePreferenceStorage(): ThemeStorageAdapter | null {
  return storage;
}

/** Read the persisted choice. `null` when unset, unreadable, or not a mode. */
export async function loadStoredThemePreference(): Promise<ThemePreference | null> {
  if (storage === null) return null;
  try {
    const value = await storage.getItem(THEME_PREFERENCE_STORAGE_KEY);
    return isThemePreference(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Persist a choice. Swallows write failures, like `persistLocale`: a full disk
 * must not turn the appearance switch into an unhandled rejection. The choice
 * still applies to this session, it just will not survive a relaunch.
 */
export async function persistThemePreference(preference: ThemePreference): Promise<void> {
  if (storage === null || !isThemePreference(preference)) return;
  try {
    await storage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
  } catch {
    // Preference only — see above.
  }
}

/** Forget the persisted choice, so the app is dark again on the next launch. */
export async function clearStoredThemePreference(): Promise<void> {
  if (storage === null) return;
  try {
    await storage.deleteItem(THEME_PREFERENCE_STORAGE_KEY);
  } catch {
    // Preference only — see above.
  }
}

/** The effective mode: persisted choice → default. Pure, so the order is a test. */
export function resolveThemePreference(
  stored: ThemePreference | null,
  fallback: ThemePreference = defaultThemePreference,
): ThemePreference {
  return stored ?? fallback;
}

/**
 * What a completed hydration should apply — or `null` for "leave it alone".
 *
 * The same guard as `hydratedLocale`, and it is needed here for the same
 * reason: the read can be slow on a cold start, the switch is reachable in two
 * taps, and a tap that resolves *before* the read would otherwise be undone by
 * it a moment later. Two reasons to skip: the user has already chosen (their
 * tap outranks disk, and it was itself persisted), or the answer is already on
 * screen — returning `null` there spares the whole tree a re-render, which for
 * a theme change is every themed component in it.
 */
export function hydratedThemePreference(options: {
  readonly stored: ThemePreference | null;
  readonly current: ThemePreference;
  readonly userChose: boolean;
}): ThemePreference | null {
  if (options.userChose) return null;
  const next = resolveThemePreference(options.stored, options.current);
  return next === options.current ? null : next;
}

/**
 * Install `@react-native-async-storage/async-storage` as the preference store.
 *
 * The module name is indirected through a variable so Vitest never resolves a
 * native module; only {@link bootThemePreference} calls this.
 */
export async function installAsyncStorageThemePreference(): Promise<void> {
  const moduleName = '@react-native-async-storage/async-storage';
  const imported = (await import(/* @vite-ignore */ moduleName)) as {
    default: {
      getItem(key: string): Promise<string | null>;
      setItem(key: string, value: string): Promise<void>;
      removeItem(key: string): Promise<void>;
    };
  };
  const asyncStorage = imported.default;
  setThemePreferenceStorage({
    getItem: (key) => asyncStorage.getItem(key),
    setItem: (key, value) => asyncStorage.setItem(key, value),
    deleteItem: (key) => asyncStorage.removeItem(key),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────

let booted: Promise<ThemePreference | null> | null = null;

/**
 * Install the store, read the choice — once per process, memoised.
 *
 * TWO CALLERS, ONE READ, AND THE MEMO IS WHAT MAKES THAT SAFE. The provider
 * needs the value to render with; `useAppBootstrap` needs to know the read has
 * LANDED, because that is what holds the splash over the dark first frame a
 * light-mode member would otherwise watch flip. React runs a child's effect
 * before its parent's, so the provider gets there first and the bootstrap hook
 * joins the same promise instead of starting a second read.
 *
 * A failed install is stepped over rather than propagated: the dynamic import
 * throws on any runtime without AsyncStorage linked, and there the right answer
 * is "dark" — never a rejected boot gate that holds the splash forever.
 *
 * An ALREADY-INSTALLED store wins over the default one, and that is not just
 * for specs: `setThemePreferenceStorage` is the injection seam, so a caller
 * that has handed over a backend has said which backend it wants. (It bites in
 * the suite first — Vitest resolves the AsyncStorage package happily, so an
 * unconditional install would swap a spec's fake for a web shim that answers
 * `null` to everything.)
 */
export function bootThemePreference(): Promise<ThemePreference | null> {
  booted ??= (storage === null ? installAsyncStorageThemePreference() : Promise.resolve())
    .catch(() => undefined)
    .then(() => loadStoredThemePreference());
  return booted;
}

/** Forget the memo. Specs only — the app boots once. */
export function resetThemePreferenceBoot(): void {
  booted = null;
}
