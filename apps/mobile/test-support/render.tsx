// The render harness for the app's screen tests.
//
// It mounts the SAME provider stack the root layout does — `AppProviders` minus
// nothing — so a screen under test sees the real theme, the real catalogues and
// the real toast host. Two things follow from that and both are deliberate:
//
//   * `t()` returns REAL COPY, in a real locale. So a test can assert the
//     Georgian string and prove the screen has no English baked in, which is
//     plan §6 item 6 and is not something a `t: (k) => k` stub can check.
//   * a missing provider fails here rather than in production. `useI18n` throws
//     outside its provider by design, and `useSafeAreaInsets` outside
//     `SafeAreaProvider` throws too.
//
// `initialLocale` is threaded through because `I18nProvider` reads the persisted
// choice asynchronously AFTER mount; pinning the first frame is the only way to
// assert a locale deterministically.
//
// ## `renderApp` or `renderScreen`?
//
// There are two harnesses and the difference is one provider.
//
//   * `renderApp` (here) mounts the FULL tower, `SafeAreaProvider` included, with
//     an iPhone 14's insets seeded — `SafeAreaProvider` renders nothing at all
//     until it knows its insets, and the native event that would tell it never
//     fires under a test renderer. Use it for anything whose geometry depends on
//     a real inset, and for the root layout, whose whole job is the tower.
//   * `renderScreen` (`./render-screen.tsx`) deliberately OMITS it, because
//     `@fit/ui-mobile` reads `SafeAreaInsetsContext` directly and falls back to
//     zeros, and zero insets are the artboards' own geometry — so those tests
//     assert the same numbers the design does.
//
// Neither is a legacy of the other. Pick by whether the assertion is about the
// design's measurements (`renderScreen`) or about the app as assembled
// (`renderApp`).

import type { Locale } from '@fit/i18n';
import { ToastProvider } from '@fit/ui-mobile';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ThemePreference } from '../lib/theme-preference';
import { I18nProvider } from '../providers/I18nProvider';
import { ThemePreferenceProvider } from '../providers/ThemePreferenceProvider';

/**
 * A fresh cache per test.
 *
 * NOT the app's `queryClient` singleton: it is module state, so one test's
 * entries would survive into the next, and `retry: false` here keeps a failing
 * fetch from burning three attempts and a backoff inside a test's timeout.
 */
function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/**
 * `SafeAreaProvider` reads its insets from a native layout event that never
 * fires under a test renderer, so without seeded metrics every consumer reads
 * `0` at first and some read `undefined`. These are an iPhone 14's.
 */
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export interface HarnessOptions extends Omit<RenderOptions, 'wrapper'> {
  /** The locale of the first frame. Default `'en'`. */
  locale?: Locale;
  /**
   * The appearance of the first frame. Default `'dark'` — the app's own.
   *
   * Pinned for the same reason as the locale: `ThemePreferenceProvider` reads
   * the persisted choice asynchronously AFTER mount, so this is the only way to
   * assert a mode deterministically.
   */
  appearance?: ThemePreference;
}

/** Render `ui` inside the app's real provider stack. */
export function renderApp(ui: ReactElement, options: HarnessOptions = {}): RenderResult {
  const { locale = 'en', appearance = 'dark', ...rest } = options;
  const client = testQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        {/* Not the kit's bare `ThemeProvider`: the app mounts the preference
            wrapper, and a screen that reads `useThemePreference()` — the
            appearance switch on `/profile` — must find it here for the same
            reason `useI18n` is real rather than stubbed. */}
        <ThemePreferenceProvider initialPreference={appearance}>
          <QueryClientProvider client={client}>
            <I18nProvider initialLocale={locale}>
              <ToastProvider>{children}</ToastProvider>
            </I18nProvider>
          </QueryClientProvider>
        </ThemePreferenceProvider>
      </SafeAreaProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...rest });
}
