import { portalThemeVars, type PortalColorChoice, type PortalThemeVars } from './portal-theme';

export interface BrandSkin {
  name: string;
  light: PortalThemeVars;
  dark: PortalThemeVars;
}

// Copied from SYNERGY_THEME on origin/feat/mobile-synergy-app, apps/mobile/lib/brand.ts.
// Keep the guide unchanged. Mobile's omitted dark tileBorder defaults to transparent.
// focusRing is a colour on mobile, but the portal token is a complete box-shadow.
export const BRAND_SKINS: Readonly<Record<string, BrandSkin>> = {
  synergy: {
    name: 'Synergy',
    light: {
      '--color-background-body': '#F3EDE3',
      '--color-background-surface': '#EBE3D6',
      '--color-background-card': '#EBE3D6',
      '--color-background-popover': '#F8F4EC',
      '--color-background-muted': '#E3DACB',
      '--color-neutral': '#E3DACB',
      '--color-skeleton': '#DDD3C3',
      '--color-accent': '#526EAA',
      '--fc-accent-hover': '#6A84BA',
      '--color-accent-muted': '#DCDFE6',
      '--color-on-accent': '#F3EDE3',
      '--fc-membership': '#765B49',
      '--color-text-accent': '#405A94',
      '--color-icon-accent': '#405A94',
      '--color-text-primary': '#1C1C1E',
      '--color-text-secondary': '#765B49',
      '--color-text-disabled': '#AA9C8E',
      '--color-icon-primary': '#1C1C1E',
      '--color-icon-secondary': '#765B49',
      '--color-icon-disabled': '#C2B6A8',
      '--color-on-dark': '#F3EDE3',
      '--color-on-light': '#1C1C1E',
      '--color-border': '#DDD3C3',
      '--color-border-emphasized': '#C9BDAB',
      '--color-success': '#526EAA',
      '--color-success-muted': '#DCDFE6',
      '--color-on-success': '#F3EDE3',
      '--color-warning': '#765B49',
      '--color-warning-muted': '#E3DACB',
      '--fc-tile': '#F8F4EC',
      '--fc-tile-border': '#DDD3C3',
      '--fc-tile-hover': '#E3DACB',
      '--fc-quiet': '#DDD3C3',
      '--fc-on-quiet': '#4A3B31',
      '--fc-ghost': '#E3DACB',
      '--fc-on-ghost': '#765B49',
      '--fc-booked': '#DCDFE6',
      '--fc-on-booked': '#405A94',
      '--fc-booked-border': '#526EAA',
      '--fc-header': 'rgba(243, 237, 227, 0.95)',
      '--fc-control': '#F8F4EC',
      '--fc-avatar-ring': '#C9BDAB',
      '--fc-glass': 'rgba(248, 244, 236, 0.80)',
      '--fc-glass-border': 'rgba(28, 28, 30, 0.10)',
      '--fc-focus-ring': '0 0 0 3px rgba(82, 110, 170, 0.40)',
    },
    dark: {
      '--color-background-body': '#1C1C1E',
      '--color-background-surface': '#262628',
      '--color-background-card': '#262628',
      '--color-background-popover': '#262628',
      '--color-background-muted': '#303033',
      '--color-neutral': '#303033',
      '--color-skeleton': '#303033',
      '--color-accent': '#526EAA',
      '--fc-accent-hover': '#6A84BA',
      '--color-accent-muted': '#272E40',
      '--color-on-accent': '#F3EDE3',
      '--fc-membership': '#765B49',
      '--color-text-accent': '#A9BBE3',
      '--color-icon-accent': '#A9BBE3',
      '--color-text-primary': '#F3EDE3',
      '--color-text-secondary': '#ADA69C',
      '--color-text-disabled': '#6E6A65',
      '--color-icon-primary': '#F3EDE3',
      '--color-icon-secondary': '#ADA69C',
      '--color-icon-disabled': '#56534F',
      '--color-on-dark': '#F3EDE3',
      '--color-on-light': '#1C1C1E',
      '--color-border': '#343437',
      '--color-border-emphasized': '#48484C',
      '--color-success': '#A9BBE3',
      '--color-success-muted': '#272E40',
      '--color-on-success': '#F3EDE3',
      '--color-warning': '#B79A86',
      '--color-warning-muted': '#3A302A',
      '--fc-tile': '#1C1C1E',
      '--fc-tile-hover': '#303033',
      '--fc-quiet': '#303033',
      '--fc-on-quiet': '#E2DBD0',
      '--fc-ghost': '#303033',
      '--fc-on-ghost': '#CFC8BD',
      '--fc-booked': '#272E40',
      '--fc-on-booked': '#C3D0EE',
      '--fc-booked-border': '#526EAA',
      '--fc-header': 'rgba(28, 28, 30, 0.95)',
      '--fc-control': '#262628',
      '--fc-avatar-ring': '#48484C',
      '--fc-glass': 'rgba(38, 38, 40, 0.72)',
      '--fc-glass-border': 'rgba(243, 237, 227, 0.12)',
      '--fc-focus-ring': '0 0 0 3px rgba(82, 110, 170, 0.40)',
      '--fc-tile-border': 'transparent',
    },
  },
};

export function getBrandSkin(slug: string | null | undefined): BrandSkin | null {
  return slug && Object.hasOwn(BRAND_SKINS, slug) ? (BRAND_SKINS[slug] ?? null) : null;
}

/** Pure shared token mapping; asset URLs belong to each app. */
export function brandSkinVars(slug: string | null | undefined): PortalThemeVars {
  const skin = getBrandSkin(slug);
  if (!skin) return {};
  return Object.fromEntries(
    Object.entries(skin.light).map(([token, light]) => {
      const dark = skin.dark[token as keyof PortalThemeVars];
      return [token, light === dark ? light : `light-dark(${light}, ${dark})`];
    }),
  );
}

/** A deliberate console choice wins over the brand's accent ramp. */
export function brandedPortalThemeVars(
  slug: string | null | undefined,
  colors: PortalColorChoice | null,
): PortalThemeVars {
  const chosen = colors ? portalThemeVars(colors) : {};
  return {
    ...brandSkinVars(slug),
    ...chosen,
    // The original portal derives this shadow from accent. A skin supplies a
    // literal guide colour, so restore that derivation for a console override.
    ...(getBrandSkin(slug) && chosen['--color-accent']
      ? { '--fc-focus-ring': '0 0 0 3px color-mix(in srgb, var(--color-accent) 40%, transparent)' }
      : {}),
  };
}
