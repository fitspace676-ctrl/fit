'use client';

// @fit/admin — the gym's currency, available to every client component.
//
// A gym prices in exactly one currency: `settings.locale.currency` (Settings →
// General). Before this existed, each money surface carried its own fallback —
// the POS cart, the product form and the plan form all hardcoded `'USD'` — so a
// gym configured in GEL still saw an empty till total of "0,00 US$" and every
// product it created was stamped USD. The fix is one server-read value, seeded
// in the dashboard layout and read from here.
//
// This is a *display and default* source only. A record that stores its own
// currency (a product, an order, a payment) is always rendered in the currency it
// was written with — history is not relabelled when a gym switches.

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_CURRENCY } from '@fit/types';

const GymCurrencyContext = createContext<string>(DEFAULT_CURRENCY);

/**
 * Seed the gym's configured currency for the console. `currency` comes from the
 * server (`GET /gyms/settings`), so the first client render already has the real
 * value and nothing flashes a placeholder.
 */
export function GymCurrencyProvider({
  currency,
  children,
}: {
  currency: string;
  children: ReactNode;
}) {
  return <GymCurrencyContext.Provider value={currency}>{children}</GymCurrencyContext.Provider>;
}

/**
 * The gym's configured ISO-4217 currency. Falls back to the platform default only
 * when a component renders outside the dashboard layout (tests, storybook-style
 * previews) — inside the console it is always the gym's own.
 */
export function useGymCurrency(): string {
  return useContext(GymCurrencyContext);
}
