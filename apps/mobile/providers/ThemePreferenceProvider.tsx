// @fit/mobile — light or dark, and the one place the app decides which.
//
// The same shape as `I18nProvider`, deliberately: a thin React shell over a
// pure module (`lib/theme-preference.ts`) that holds everything worth testing,
// because the fast Vitest suite cannot import `react-native` (§5).
//
//   * **First paint is synchronous**, on `dark`. There is no `await
//     AsyncStorage.getItem` between the splash and the first frame.
//   * **The splash covers the swap.** `useAppBootstrap` gates `ready` on the
//     same memoised `bootThemePreference()` promise this provider reads, so a
//     light-mode member never watches a dark frame flip to light — the read has
//     landed before the splash comes down. That gate is the whole reason the
//     boot is memoised rather than done here alone.
//   * **The hydrate cannot clobber a concurrent choice** — `hydratedThemePreference`,
//     where that rule lives as a tested pure function.
//
// ---------------------------------------------------------------------------
// `Appearance.setColorScheme` IS NOT DECORATION, AND IT IS WHY app.json SAYS
// `"automatic"`.
//
// `ThemeProvider` colours what we draw. It does not reach the chrome the OS
// draws for us: the keyboard, `Alert`, the action sheet, the text-selection
// handles, the scroll indicators. Those follow the app's UIKit/Android trait,
// and there are exactly two ways that trait can be set:
//
//   * `userInterfaceStyle: "dark"` in app.json PINS it. Every one of those
//     surfaces stays dark forever — including for a member who has just chosen
//     the light app, who would then get a black keyboard over a white sheet.
//     It also makes `setColorScheme` a no-op, because the pin outranks it.
//   * `"automatic"` hands the trait to the OS *unless the app overrides it* —
//     which is what this call does, on every change, with OUR preference rather
//     than the phone's. The OS setting therefore never actually shows through:
//     the first thing that happens after hydration is an override.
//
// So `"automatic"` plus this effect is the only combination where the native
// chrome follows the in-app switch. The one frame between launch and the first
// override belongs to the splash, which is a fixed `#131312` image either way.
//
// Guarded because the same code runs on the Expo web build (the review panel),
// where `Appearance.setColorScheme` is not implemented, and a hard call there
// would take the whole tree down over a cosmetic sync.

import { ThemeProvider } from '@fit/ui-mobile';
import { Appearance } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  bootThemePreference,
  defaultThemePreference,
  hydratedThemePreference,
  isThemePreference,
  persistThemePreference,
  type ThemePreference,
} from '../lib/theme-preference';

export interface ThemePreferenceContextValue {
  /** The mode the app is drawing in. */
  preference: ThemePreference;
  /** The two modes, in switch order — dark first, because dark is the product. */
  preferences: readonly ThemePreference[];
  /** Switch the mode and persist the choice. Ignores anything but the two modes. */
  setPreference: (next: ThemePreference) => void;
}

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

const PREFERENCES: readonly ThemePreference[] = ['dark', 'light'];

export interface ThemePreferenceProviderProps {
  children: ReactNode;
  /**
   * The mode of the first frame, before the persisted choice is read.
   * Optional — the contract the app codes against is `{ children }`. It exists
   * so render tests can pin a mode without touching storage.
   */
  initialPreference?: ThemePreference;
}

/** Owns the appearance choice and hands the kit's `ThemeProvider` its scheme. */
export function ThemePreferenceProvider({
  children,
  initialPreference = defaultThemePreference,
}: ThemePreferenceProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);

  // Set the instant the user picks a mode, and never unset. A ref, not state:
  // the hydration callback has to read the value at the moment it resolves, and
  // a state read there would be the stale one captured at mount — the race.
  const userChose = useRef(false);

  useEffect(() => {
    let active = true;
    void bootThemePreference().then((stored) => {
      if (!active) return;
      // A functional update, so the comparison runs against the mode as of
      // *this moment* rather than the one captured when the effect was created.
      setPreferenceState(
        (current) =>
          hydratedThemePreference({ stored, current, userChose: userChose.current }) ?? current,
      );
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // See the header: this is what carries the choice into the keyboard, the
    // alerts and the sheets the OS draws for us.
    if (typeof Appearance.setColorScheme !== 'function') return;
    try {
      Appearance.setColorScheme(preference);
    } catch {
      // Cosmetic sync of native chrome. Never worth the tree.
    }
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    if (!isThemePreference(next)) return;
    userChose.current = true;
    setPreferenceState(next);
    void persistThemePreference(next);
  }, []);

  const value = useMemo<ThemePreferenceContextValue>(
    () => ({ preference, preferences: PREFERENCES, setPreference }),
    [preference, setPreference],
  );

  return (
    <ThemePreferenceContext.Provider value={value}>
      {/* Never `"system"`. The preference IS the answer, and letting the OS in
          behind it would mean the switch says one thing and the phone another. */}
      <ThemeProvider scheme={preference}>{children}</ThemeProvider>
    </ThemePreferenceContext.Provider>
  );
}

/**
 * Read the appearance choice.
 *
 * Throws outside a provider, like `useI18n`: a screen that renders an
 * appearance switch with no provider above it would otherwise draw a control
 * that silently changes nothing, which is the failure this hook exists to make
 * loud. Components that only need COLOURS use `useTheme()` from the kit, which
 * defaults to dark without a provider by design.
 */
export function useThemePreference(): ThemePreferenceContextValue {
  const context = useContext(ThemePreferenceContext);
  if (context === null) {
    throw new Error('useThemePreference must be used within a <ThemePreferenceProvider>.');
  }
  return context;
}
