import { portalThemeVars } from '@fit/types';

/**
 * The stylesheet that paints the gym's chosen colour onto the console, or `null`
 * when it chose none and the console keeps the theme's default (the sky blue).
 *
 * The colour is the console's own setting (Settings, `console.primaryColor`),
 * but the derivation is the member portal's (`portalThemeVars` in `@fit/types`),
 * so a colour reads the same way in both apps: the fill, the ink on it, the
 * accent type corrected for each theme.
 *
 * A `<style>` rule on the theme scope rather than inline vars on a wrapper,
 * because dialogs, popovers and toasts render into `<body>` outside any wrapper
 * and would keep the default colour. Unlayered, so it beats the theme's
 * `@layer astryx-theme` values. Every value comes from a parsed hex, so nothing a
 * gym typed reaches the stylesheet verbatim.
 */
export function consoleThemeCss(primaryColor: string | null): string | null {
  const vars = portalThemeVars({ primaryColor });
  const entries = Object.entries(vars);
  if (entries.length === 0) {
    return null;
  }
  const body = entries.map(([name, value]) => `${name}:${value};`).join('');
  return `[data-astryx-theme='formacore']{${body}}`;
}
