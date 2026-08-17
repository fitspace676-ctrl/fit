// @fit/admin — the palette playground's colour maths and storage.
//
// The console's colours come from `fitTheme`, applied as CSS custom properties on
// `:root`. Nothing here changes the theme — it writes *inline* overrides onto the
// same element, which win over the stylesheet without touching it. So the
// playground can be used to try a palette on every screen and thrown away with a
// single click, and no experiment can ever leak into a build.
//
// Kept out of the component so the pre-paint script and the panel share one
// definition of what a palette is and how it expands.

/** The colours the panel exposes. Everything else is derived from these. */
export interface PaletteOverride {
  /** Primary action colour — buttons, active nav, focus rings. */
  accent?: string;
  /** The page canvas behind everything. */
  background?: string;
  /** Cards, panels, the sidebar — one step off the canvas. */
  surface?: string;
  /** Hairlines between things. */
  border?: string;
  /** Body copy. */
  text?: string;
  /** Secondary copy — labels, hints, muted table cells. */
  textMuted?: string;
}

/** Where the chosen palette lives between reloads. */
export const PALETTE_STORAGE_KEY = 'fit-admin-palette';

/** Parse `#rgb` / `#rrggbb` to channels, or `null` when it is not a hex colour. */
function toRgb(hex: string): { r: number; g: number; b: number } | null {
  const value = hex.trim().replace(/^#/, '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

/** Channels back to `#rrggbb`. */
function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const clamp = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

/** Blend `amount` of `b` into `a` (0 = all `a`, 1 = all `b`). */
function mix(a: string, b: string, amount: number): string | null {
  const from = toRgb(a);
  const to = toRgb(b);
  if (!from || !to) return null;
  return toHex({
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  });
}

/**
 * Perceived lightness, 0–1. Used only to decide whether text on a colour should
 * be black or white, so the cheap sRGB approximation is enough.
 */
function luminance(hex: string): number {
  const rgb = toRgb(hex);
  if (!rgb) return 0;
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

/**
 * Expand a palette into the full set of custom properties to write.
 *
 * The point of deriving rather than asking for every token: an accent picked on
 * its own leaves the tinted chips, hover fills and accent text still keyed to the
 * old brand, and the screen looks broken rather than re-coloured. So one choice
 * moves the whole accent family, mixed toward the canvas so tints stay legible in
 * whichever mode is showing.
 */
export function paletteToVariables(
  palette: PaletteOverride,
  isDark: boolean,
): Record<string, string> {
  const vars: Record<string, string> = {};
  const canvas = palette.background ?? (isDark ? '#1B1B1B' : '#F1F1F1');

  if (palette.accent) {
    const accent = palette.accent;
    vars['--color-accent'] = accent;
    // A tint of the accent for chips and selected rows: toward the canvas, so it
    // reads as a wash in light mode and a deep stain in dark.
    const muted = mix(accent, canvas, isDark ? 0.72 : 0.86);
    if (muted) vars['--color-accent-muted'] = muted;
    // Accent-coloured text sits on the canvas, not on the accent, so it needs to
    // move away from the canvas rather than toward it.
    const accentText = mix(accent, isDark ? '#FFFFFF' : '#000000', 0.18);
    if (accentText) {
      vars['--color-text-accent'] = accentText;
      vars['--color-icon-accent'] = accentText;
    }
    // Whatever sits *on* the accent (button labels) follows its lightness.
    vars['--color-on-accent'] = luminance(accent) > 0.62 ? '#101010' : '#FFFFFF';

    // The primary button and the active table chip are painted with a two-stop
    // gradient rather than a flat accent. It used to be hardcoded, which is why
    // the console's most visible element ignored the theme entirely; it now reads
    // these, so the playground moves it with everything else. The second stop is
    // a hue-shifted partner rather than the same colour twice, keeping the depth
    // the original gradient had.
    vars['--brand-gradient-from'] = accent;
    const partner = mix(accent, '#EC4899', 0.55);
    if (partner) vars['--brand-gradient-to'] = partner;
  }

  if (palette.background) {
    vars['--color-background-body'] = palette.background;
  }
  if (palette.surface) {
    vars['--color-background-surface'] = palette.surface;
    vars['--color-background-card'] = palette.surface;
    // The "muted" fill used for hover rows and disabled inputs is a nudge off the
    // surface, in whichever direction the mode implies.
    const muted = mix(palette.surface, isDark ? '#FFFFFF' : '#000000', 0.06);
    if (muted) vars['--color-background-muted'] = muted;
    const overlay = mix(palette.surface, isDark ? '#FFFFFF' : '#000000', 0.08);
    if (overlay) vars['--color-overlay-hover'] = overlay;
  }
  if (palette.border) {
    vars['--color-border'] = palette.border;
    const emphasized = mix(palette.border, isDark ? '#FFFFFF' : '#000000', 0.18);
    if (emphasized) vars['--color-border-emphasized'] = emphasized;
  }
  if (palette.text) {
    vars['--color-text-primary'] = palette.text;
  }
  if (palette.textMuted) {
    vars['--color-text-secondary'] = palette.textMuted;
  }

  return vars;
}

/** Write a palette onto `:root`, clearing anything it no longer sets. */
export function applyPalette(palette: PaletteOverride, isDark: boolean): void {
  const root = document.documentElement;
  // Clear first: dropping one colour must remove its override rather than leave
  // a stale value behind, which is what makes "reset" trustworthy.
  for (const name of ALL_OVERRIDDEN_VARIABLES) {
    root.style.removeProperty(name);
  }
  for (const [name, value] of Object.entries(paletteToVariables(palette, isDark))) {
    root.style.setProperty(name, value);
  }
}

/** Every property the playground may write — the list `applyPalette` clears. */
export const ALL_OVERRIDDEN_VARIABLES = [
  '--color-accent',
  '--color-accent-muted',
  '--color-text-accent',
  '--color-icon-accent',
  '--color-on-accent',
  '--color-background-body',
  '--color-background-surface',
  '--color-background-card',
  '--color-background-muted',
  '--color-overlay-hover',
  '--color-border',
  '--color-border-emphasized',
  '--color-text-primary',
  '--color-text-secondary',
  '--brand-gradient-from',
  '--brand-gradient-to',
] as const;

/**
 * The colour a custom property actually resolves to right now, as `#rrggbb`.
 *
 * Reading the property directly is not enough: the theme declares several of them
 * as `light-dark(#…, #…)`, which is a valid value a colour input cannot show. So
 * a throwaway element is asked to *use* the variable, and its computed `color` —
 * always resolved to `rgb()` — is converted back. Without this the panel opened
 * showing colours the console was not actually wearing, which defeats the point
 * of judging a palette against real screens.
 */
export function resolveCssColor(variable: string): string | null {
  const probe = document.createElement('span');
  probe.style.color = `var(${variable})`;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();

  const match = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(computed);
  if (!match) return null;
  return toHex({ r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) });
}

/** Read the saved palette, or an empty one. Never throws on corrupt storage. */
export function readStoredPalette(): PaletteOverride {
  try {
    const raw = window.localStorage.getItem(PALETTE_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** A few starting points, so the panel is useful before anyone picks a colour. */
export const PALETTE_PRESETS: { name: string; palette: PaletteOverride }[] = [
  { name: 'Indigo (default)', palette: {} },
  { name: 'Emerald', palette: { accent: '#10B981' } },
  { name: 'Amber', palette: { accent: '#F59E0B' } },
  { name: 'Rose', palette: { accent: '#F43F5E' } },
  { name: 'Sky', palette: { accent: '#0EA5E9' } },
  { name: 'Violet', palette: { accent: '#8B5CF6' } },
  { name: 'Slate ink', palette: { accent: '#475569', surface: '#0F172A', background: '#020617' } },
];
