// @fit/web — the theme contract shared by the server layout and the client toggle.
//
// Deliberately NOT a `'use client'` module. When a server component imports a
// value from one, React hands it a client *reference* rather than the value —
// so `cookies().get(THEME_COOKIE)` was being passed a stub instead of the string
// `'theme'`. `get()` answers `undefined` for an unknown key rather than
// throwing, so the layout silently fell back to dark on every request: the
// toggle wrote the cookie, the cookie reached the server, and the server could
// never read it. Keeping the constant here is what makes both sides agree.

/** The two skins the member portal ships. */
export type Theme = 'light' | 'dark';

/** Cookie the chosen theme is persisted under, read by the server layout. */
export const THEME_COOKIE = 'theme';

/** How long the choice sticks — a year, so it outlives any session. */
export const THEME_COOKIE_MAX_AGE = 31_536_000;

/** The skin to paint when the cookie is missing or unrecognised. */
export const DEFAULT_THEME: Theme = 'dark';

/** Narrow a raw cookie value to a {@link Theme}, falling back to the default. */
export function resolveTheme(value: string | undefined): Theme {
  return value === 'light' || value === 'dark' ? value : DEFAULT_THEME;
}
