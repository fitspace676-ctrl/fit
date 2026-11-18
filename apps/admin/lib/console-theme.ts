import { brandedPortalThemeVars } from '@fit/types';

/**
 * The stylesheet that paints the gym's chosen colour onto the console, or `null`
 * when neither a registered skin nor a chosen colour applies.
 *
 * The colour is the console's own setting (Settings, `console.primaryColor`),
 * but the derivation is the member portal's (`portalThemeVars` in `@fit/types`),
 * so a colour reads the same way in both apps: the fill, the ink on it, the
 * accent type corrected for each theme.
 *
 * A `<style>` rule on the theme scope rather than inline vars on a wrapper,
 * because dialogs, popovers and toasts render into `<body>` outside any wrapper
 * and would keep the default colour. Unlayered, so it beats the theme's
 * `@layer astryx-theme` values. Values come from the static skin or parsed hex;
 * gym input never reaches CSS verbatim. globals.css binds color-scheme to the
 * root .dark class, so light-dark() follows the console toggle (including portals).
 */
export function consoleThemeCss(primaryColor: string | null, slug?: string | null): string | null {
  const vars = brandedPortalThemeVars(slug, { primaryColor });
  // Staff status meanings keep the shipped success/warning/error palette.
  // Membership is portal-only and has no console token definition.
  const entries = Object.entries(vars).filter(
    ([name]) =>
      name !== '--fc-membership' && !/--color-(?:on-)?(?:success|warning|error)(?:-|$)/.test(name),
  );
  if (entries.length === 0) {
    return null;
  }
  const body = entries.map(([name, value]) => `${name}:${value};`).join('');
  return `[data-astryx-theme='formacore']{${body}}`;
}
