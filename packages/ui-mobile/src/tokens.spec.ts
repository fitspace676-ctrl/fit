import { describe, expect, it } from 'vitest';

import {
  brand,
  darkTheme,
  getTheme,
  lightTheme,
  radius,
  spacing,
  typography,
  type ThemeColors,
} from './tokens';

describe('brand scale', () => {
  it('mirrors the shared @fit/config/tailwind brand tokens', () => {
    // These MUST equal `fitTheme.colors.brand` in @fit/config/tailwind so web
    // and mobile never drift. If the shared preset changes, update both.
    expect(brand[500]).toBe('#2f7bff');
    expect(brand[950]).toBe('#122357');
    expect(brand[50]).toBe('#eef6ff');
  });

  it('exposes every step as a hex color', () => {
    for (const value of Object.values(brand)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('getTheme', () => {
  it('returns the light palette for a light appearance', () => {
    const theme = getTheme(false);
    expect(theme.isDark).toBe(false);
    expect(theme.colors).toBe(lightTheme);
  });

  it('returns the dark palette for a dark appearance', () => {
    const theme = getTheme(true);
    expect(theme.isDark).toBe(true);
    expect(theme.colors).toBe(darkTheme);
  });
});

describe('palettes', () => {
  const roles: (keyof ThemeColors)[] = [
    'background',
    'surface',
    'surfaceMuted',
    'primary',
    'primarySoft',
    'onPrimary',
    'text',
    'textMuted',
    'border',
    'danger',
    'success',
    'warning',
  ];

  it('define the same set of semantic roles in light and dark', () => {
    expect(Object.keys(lightTheme).sort()).toEqual(Object.keys(darkTheme).sort());
    expect(Object.keys(lightTheme).sort()).toEqual([...roles].sort());
  });

  it('resolve every role to a color string in both palettes', () => {
    for (const role of roles) {
      expect(typeof lightTheme[role]).toBe('string');
      expect(typeof darkTheme[role]).toBe('string');
      expect(lightTheme[role]).not.toBe('');
      expect(darkTheme[role]).not.toBe('');
    }
  });

  it('flip background and text between the two palettes', () => {
    // A cheap guard that the dark palette is not accidentally a copy of light.
    expect(darkTheme.background).not.toBe(lightTheme.background);
    expect(darkTheme.text).not.toBe(lightTheme.text);
  });
});

describe('scales', () => {
  it('ship an ascending spacing ramp anchored at zero', () => {
    expect(spacing.none).toBe(0);
    expect(spacing.xs).toBeLessThan(spacing.sm);
    expect(spacing.sm).toBeLessThan(spacing.md);
    expect(spacing.md).toBeLessThan(spacing.lg);
    expect(spacing.gutter).toBe(24);
  });

  it('keep the card radius aligned with the shared design token (12)', () => {
    expect(radius.card).toBe(12);
  });

  it('pair every type step with a line height at least as tall as its size', () => {
    for (const step of Object.values(typography)) {
      expect(step.lineHeight).toBeGreaterThanOrEqual(step.fontSize);
    }
  });
});
