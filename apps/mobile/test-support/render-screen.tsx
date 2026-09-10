// The provider stack a screen needs under jest-expo, and nothing more.
//
// A screen mounted bare throws: `useI18n` refuses to render keys outside its
// provider, and every query hook needs a client. Wrapping by hand in each test
// is how four tests end up with four slightly different clients — one of them
// with retries left on, which turns a deliberate error branch into a five-second
// timeout.
//
// `SafeAreaProvider` is deliberately ABSENT. `@fit/ui-mobile` reads
// `SafeAreaInsetsContext` directly and falls back to zeros precisely so its
// components survive being rendered without one, and zero insets are the
// artboards' own geometry — so tests assert the same numbers the design does.
import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react-native';

import { I18nProvider } from '../providers/I18nProvider';

/**
 * A client with retries and network detection off.
 *
 * `retry: false` is the load-bearing one: with the default three retries and
 * exponential backoff, a test that seeds an error state waits seconds for it
 * and then reports a timeout rather than the assertion that actually failed.
 */
export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export interface RenderScreenOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Pin the locale. Defaults to `en` so assertions can be written in English. */
  locale?: 'en' | 'ka';
  /** Supply a pre-seeded client — for a test that primes the cache. */
  client?: QueryClient;
}

/** Render a screen inside the providers the app mounts around it. */
export function renderScreen(ui: ReactElement, options: RenderScreenOptions = {}) {
  const { locale = 'en', client = makeTestQueryClient(), ...rest } = options;

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </QueryClientProvider>
    );
  }

  return { client, ...render(ui, { wrapper: Wrapper, ...rest }) };
}
