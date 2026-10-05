import { describe, expect, it } from 'vitest';
import {
  MOBILE_APP_SURFACES,
  mobileAccentPalette,
  readableTextOn,
  type MobileAccentRoles,
} from './mobile-app-theme';
import { contrastRatio, parsePortalHex } from './portal-theme';
import { resolveMobileAppPrimaryColor, updateMobileAppSettingsSchema } from './mobile-app-settings';

const ratio = (a: string, b: string): number => {
  const first = parsePortalHex(a);
  const second = parsePortalHex(b);
  if (!first || !second) throw new Error(`not a hex: ${a} / ${b}`);
  return contrastRatio(first, second);
};

// Light, dark, saturated, the mid-tones neither pole clears, greys and the poles.
const SAMPLES = [
  '#FACC15', // yellow
  '#FFF59D', // pale yellow
  '#1E3A8A', // navy
  '#0B0B0B', // near-black
  '#FFFFFF',
  '#000000',
  '#E548C8', // pink
  '#1A7FD6', // the shipped sky blue
  '#808080', // mid grey
  '#7A7A7A',
  '#0F766E', // teal
  '#DC2626', // red
  '#84CC16', // lime
];

describe('readableTextOn', () => {
  it('always returns white, the ink or black at 4.5:1 or better', () => {
    for (const fill of SAMPLES) {
      const label = readableTextOn(fill);
      expect(['#FFFFFF', '#131312', '#000000']).toContain(label);
      expect(ratio(fill, label as string)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('prefers white, then the ink', () => {
    expect(readableTextOn('#1E3A8A')).toBe('#FFFFFF');
    expect(readableTextOn('#FACC15')).toBe('#131312');
    // A mid-tone neither white nor the ink clears falls through to black.
    expect(readableTextOn('#7A7A7A')).toBe('#000000');
  });

  it('rejects anything that is not a six-digit hex', () => {
    expect(readableTextOn('red')).toBeNull();
    expect(readableTextOn('#fff')).toBeNull();
  });
});

describe('mobileAccentPalette', () => {
  it('is null without a colour, so the app keeps its built-in theme', () => {
    expect(mobileAccentPalette(null)).toBeNull();
    expect(mobileAccentPalette('nope')).toBeNull();
  });

  const check = (roles: MobileAccentRoles, surfaces: readonly string[]) => {
    expect(ratio(roles.accent, roles.onAccent)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(roles.success, roles.onSuccess)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(roles.booked, roles.onBooked)).toBeGreaterThanOrEqual(4.5);
    for (const surface of surfaces) {
      expect(ratio(roles.accent, surface)).toBeGreaterThanOrEqual(3);
      expect(ratio(roles.bookedBorder, surface)).toBeGreaterThanOrEqual(3);
      expect(ratio(roles.textAccent, surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(roles.focusRing).toMatch(/^rgba\(\d+, \d+, \d+, 0\.40\)$/);
  };

  it('keeps every fill visible and every label readable in both modes', () => {
    for (const hex of SAMPLES) {
      const palette = mobileAccentPalette(hex);
      expect(palette).not.toBeNull();
      check(palette!.light, Object.values(MOBILE_APP_SURFACES.light));
      check(palette!.dark, Object.values(MOBILE_APP_SURFACES.dark));
    }
  });

  it('uses a colour that already reads exactly as chosen', () => {
    const teal = mobileAccentPalette('#0f766e')!;
    expect(teal.light.accent).toBe('#0F766E');
    expect(teal.light.onAccent).toBe('#FFFFFF');
    const yellow = mobileAccentPalette('#FACC15')!;
    expect(yellow.dark.accent).toBe('#FACC15');
    expect(yellow.dark.onAccent).toBe('#131312');
    // On the light page the same yellow is darkened until it shows.
    expect(yellow.light.accent).not.toBe('#FACC15');
  });
});

describe('resolveMobileAppPrimaryColor', () => {
  const settings = {
    memberPortal: { primaryColor: '#e548c8' },
    brand: { primaryColor: '#0f766e' },
  };

  it('falls through app → portal → brand → built-in', () => {
    expect(resolveMobileAppPrimaryColor(true, '#facc15', settings)).toEqual({
      primaryColor: '#facc15',
      primaryColorSource: 'app',
      inheritedPrimaryColor: '#e548c8',
      inheritedPrimaryColorSource: 'portal',
      onPrimaryColor: '#131312',
    });
    expect(resolveMobileAppPrimaryColor(true, null, settings).primaryColorSource).toBe('portal');
    expect(
      resolveMobileAppPrimaryColor(true, null, { brand: { primaryColor: '#0f766e' } })
        .primaryColorSource,
    ).toBe('brand');
    expect(resolveMobileAppPrimaryColor(true, null, null).primaryColor).toBeNull();
  });

  it('ignores the default brand colour, malformed values and gyms without an app', () => {
    expect(
      resolveMobileAppPrimaryColor(true, null, { brand: { primaryColor: '#4f46e5' } }).primaryColor,
    ).toBeNull();
    expect(
      resolveMobileAppPrimaryColor(true, 'red', { memberPortal: { primaryColor: 3 } }),
    ).toEqual({
      primaryColor: null,
      primaryColorSource: null,
      inheritedPrimaryColor: null,
      inheritedPrimaryColorSource: null,
      onPrimaryColor: null,
    });
    expect(resolveMobileAppPrimaryColor(false, '#facc15', settings).primaryColor).toBeNull();
  });

  it('accepts the colour or the features alone, never an empty body', () => {
    expect(updateMobileAppSettingsSchema.safeParse({ primaryColor: '#facc15' }).success).toBe(true);
    expect(updateMobileAppSettingsSchema.safeParse({ primaryColor: null }).success).toBe(true);
    expect(updateMobileAppSettingsSchema.safeParse({}).success).toBe(false);
    expect(updateMobileAppSettingsSchema.safeParse({ primaryColor: 'yellow' }).success).toBe(false);
  });
});
