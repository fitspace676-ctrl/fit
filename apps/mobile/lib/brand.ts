// @fit/mobile — what a gym-branded build (see `app.config.js`) changes at runtime.
//
// The store identity, icon and splash are swapped at build time. This module is
// the rest: the name the copy uses and, for a gym with its own colour guide, the
// palette the kit paints in. `EXPO_PUBLIC_APP_VARIANT` is read as a literal
// member expression so Expo inlines it into the bundle.

import type { ThemeAccent } from '@fit/ui-mobile';

const VARIANT = process.env.EXPO_PUBLIC_APP_VARIANT;

/**
 * Synergy's colour guide (2026-11-18): near-black `#1C1C1E`, brown `#765B49`,
 * cream `#F3EDE3`, muted blue `#526EAA`.
 *
 * Dark is the home screen of the guide: black page, cream text, the brown
 * membership card and blue actions. Light is the schedule: cream page, black
 * text, brown secondary detail, blue for the chosen day and the actions. Labels
 * on blue and on brown are cream in both modes. The steps between the four
 * named colours (cards, borders, muted text) are mixes of them.
 */
const SYNERGY_THEME: ThemeAccent = {
  dark: {
    backgroundBody: '#1C1C1E',
    backgroundSurface: '#262628',
    backgroundCard: '#262628',
    backgroundPopover: '#262628',
    backgroundMuted: '#303033',
    neutral: '#303033',
    skeleton: '#303033',
    accent: '#526EAA',
    accentHover: '#6A84BA',
    accentMuted: '#272E40',
    onAccent: '#F3EDE3',
    membership: '#765B49',
    textAccent: '#A9BBE3',
    iconAccent: '#A9BBE3',
    textPrimary: '#F3EDE3',
    textSecondary: '#ADA69C',
    textDisabled: '#6E6A65',
    iconPrimary: '#F3EDE3',
    iconSecondary: '#ADA69C',
    iconDisabled: '#56534F',
    onDark: '#F3EDE3',
    onLight: '#1C1C1E',
    border: '#343437',
    borderEmphasized: '#48484C',
    success: '#A9BBE3',
    successMuted: '#272E40',
    onSuccess: '#F3EDE3',
    warning: '#B79A86',
    warningMuted: '#3A302A',
    tile: '#1C1C1E',
    tilePressed: '#303033',
    quiet: '#303033',
    onQuiet: '#E2DBD0',
    ghost: '#303033',
    onGhost: '#CFC8BD',
    booked: '#272E40',
    onBooked: '#C3D0EE',
    bookedBorder: '#526EAA',
    header: 'rgba(28, 28, 30, 0.95)',
    control: '#262628',
    avatarRing: '#48484C',
    glass: 'rgba(38, 38, 40, 0.72)',
    glassBorder: 'rgba(243, 237, 227, 0.12)',
    focusRing: 'rgba(82, 110, 170, 0.40)',
  },
  light: {
    backgroundBody: '#F3EDE3',
    backgroundSurface: '#EBE3D6',
    backgroundCard: '#EBE3D6',
    backgroundPopover: '#F8F4EC',
    backgroundMuted: '#E3DACB',
    neutral: '#E3DACB',
    skeleton: '#DDD3C3',
    accent: '#526EAA',
    accentHover: '#6A84BA',
    accentMuted: '#DCDFE6',
    onAccent: '#F3EDE3',
    membership: '#765B49',
    textAccent: '#405A94',
    iconAccent: '#405A94',
    textPrimary: '#1C1C1E',
    textSecondary: '#765B49',
    textDisabled: '#AA9C8E',
    iconPrimary: '#1C1C1E',
    iconSecondary: '#765B49',
    iconDisabled: '#C2B6A8',
    onDark: '#F3EDE3',
    onLight: '#1C1C1E',
    border: '#DDD3C3',
    borderEmphasized: '#C9BDAB',
    success: '#526EAA',
    successMuted: '#DCDFE6',
    onSuccess: '#F3EDE3',
    warning: '#765B49',
    warningMuted: '#E3DACB',
    tile: '#F8F4EC',
    tileBorder: '#DDD3C3',
    tilePressed: '#E3DACB',
    quiet: '#DDD3C3',
    onQuiet: '#4A3B31',
    ghost: '#E3DACB',
    onGhost: '#765B49',
    booked: '#DCDFE6',
    onBooked: '#405A94',
    bookedBorder: '#526EAA',
    header: 'rgba(243, 237, 227, 0.95)',
    control: '#F8F4EC',
    avatarRing: '#C9BDAB',
    glass: 'rgba(248, 244, 236, 0.80)',
    glassBorder: 'rgba(28, 28, 30, 0.10)',
    focusRing: 'rgba(82, 110, 170, 0.40)',
  },
};

/**
 * The branded build's own palette, or `null` for the FormaCore app, which keeps
 * the kit's theme and the gym's accent from its settings.
 */
export const BRAND_THEME: ThemeAccent | null = VARIANT === 'synergy' ? SYNERGY_THEME : null;

const BRAND_NAME: string | null = VARIANT === 'synergy' ? 'Synergy' : null;

/** Copy that names the product names the gym instead in a branded build. */
export function brandCopy(message: string): string {
  return BRAND_NAME === null ? message : message.replaceAll('FormaCore', BRAND_NAME);
}
