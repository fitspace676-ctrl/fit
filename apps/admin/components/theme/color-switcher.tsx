'use client';

import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Icon } from '@/components/ui';
import { useTheme } from './theme-provider';
import {
  PALETTE_PRESETS,
  PALETTE_STORAGE_KEY,
  applyPalette,
  readStoredPalette,
  resolveCssColor,
  type PaletteOverride,
} from '@/lib/color-overrides';

/** The swatches the panel offers, in the order they matter when judging a palette. */
const FIELDS: { key: keyof PaletteOverride; label: string; variable: string }[] = [
  { key: 'accent', label: 'Accent', variable: '--color-accent' },
  { key: 'background', label: 'Page', variable: '--color-background-body' },
  { key: 'surface', label: 'Surface', variable: '--color-background-surface' },
  { key: 'border', label: 'Border', variable: '--color-border' },
  { key: 'text', label: 'Text', variable: '--color-text-primary' },
  { key: 'textMuted', label: 'Muted', variable: '--color-text-secondary' },
];

const styles = stylex.create({
  dock: {
    position: 'fixed',
    insetBlockEnd: '1rem',
    insetInlineStart: '50%',
    transform: 'translateX(-50%)',
    // Above the page, below any modal — this is a tool, not part of the product.
    zIndex: 40,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    pointerEvents: 'none',
  },
  pill: {
    pointerEvents: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    height: '2.25rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    backgroundColor: 'color-mix(in srgb, var(--color-background-surface) 88%, transparent)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    boxShadow: 'var(--shadow-high)',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  pillDot: {
    width: '0.75rem',
    height: '0.75rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'color-mix(in srgb, var(--color-text-primary) 25%, transparent)',
  },
  panel: {
    pointerEvents: 'auto',
    order: -1,
    width: 'min(30rem, calc(100vw - 2rem))',
    padding: '1rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    backgroundColor: 'var(--color-background-surface)',
    boxShadow: 'var(--shadow-high)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
  },
  head: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  title: {
    flex: 1,
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  note: { fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: 0 },
  swatches: {
    display: 'grid',
    gap: '0.625rem',
    gridTemplateColumns: 'repeat(auto-fit, minmax(6.5rem, 1fr))',
  },
  field: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  label: {
    fontSize: '0.6875rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
  },
  swatchRow: { display: 'flex', alignItems: 'center', gap: '0.375rem' },
  colorInput: {
    width: '2rem',
    height: '2rem',
    padding: 0,
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'transparent',
    cursor: 'pointer',
  },
  hexInput: {
    flex: 1,
    minWidth: 0,
    height: '2rem',
    boxSizing: 'border-box',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-body)',
    paddingInline: '0.5rem',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
  },
  presets: { display: 'flex', flexWrap: 'wrap', gap: '0.375rem' },
  preset: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    paddingInline: '0.625rem',
    paddingBlock: '0.3125rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-overlay-hover)' },
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.75rem',
    cursor: 'pointer',
  },
  presetDot: {
    width: '0.625rem',
    height: '0.625rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'color-mix(in srgb, var(--color-text-primary) 20%, transparent)',
  },
  actions: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  spacer: { flex: 1 },
  ghostBtn: {
    height: '2rem',
    paddingInline: '0.75rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-overlay-hover)' },
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.8125rem',
    cursor: 'pointer',
  },
  closeIcon: { width: '1rem', height: '1rem' },
});

/**
 * A palette playground for judging colours on the real console.
 *
 * Overrides the theme's CSS custom properties inline on `:root`, so every screen
 * re-colours at once and nothing in the build changes. The choice lives in this
 * browser's `localStorage` alone — it is not a gym setting, is never sent
 * anywhere, and another operator sees the normal theme.
 *
 * Docked bottom-centre and collapsed to a pill, because the point is to look at
 * the page behind it: it has to be reachable from every screen without covering
 * the thing being judged.
 */
export function ColorSwitcher() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState<PaletteOverride>({});
  // Overrides are written by a pre-paint script before React runs; the first
  // client render adopts what is already stored rather than clearing it.
  const [ready, setReady] = useState(false);

  /** What each unset swatch is currently showing, read from the live page. */
  const [live, setLive] = useState<Record<string, string>>({});

  useEffect(() => {
    setPalette(readStoredPalette());
    setReady(true);
  }, []);

  // Sampled when the panel opens rather than hardcoded, so the swatches show the
  // console's real colours even if the theme changes underneath this tool.
  useEffect(() => {
    if (!open) return;
    const sampled: Record<string, string> = {};
    for (const field of FIELDS) {
      const value = resolveCssColor(field.variable);
      if (value) sampled[field.key] = value;
    }
    setLive(sampled);
  }, [open, isDark, palette]);

  // Re-apply on every change, and when the light/dark mode flips — the derived
  // tints are mixed toward the canvas, so they are wrong in the other mode.
  useEffect(() => {
    if (!ready) return;
    applyPalette(palette, isDark);
    try {
      if (Object.keys(palette).length === 0) {
        window.localStorage.removeItem(PALETTE_STORAGE_KEY);
      } else {
        window.localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(palette));
      }
    } catch {
      // Private mode or storage disabled — the palette still applies for this page.
    }
  }, [palette, isDark, ready]);

  const set = (key: keyof PaletteOverride, value: string): void =>
    setPalette((current) => ({ ...current, [key]: value }));

  const customCount = Object.keys(palette).length;

  return (
    <div {...stylex.props(styles.dock)}>
      {open ? (
        <div {...stylex.props(styles.panel)}>
          <div {...stylex.props(styles.head)}>
            <span {...stylex.props(styles.title)}>Palette playground</span>
            <button
              type="button"
              aria-label="Close the palette playground"
              onClick={() => setOpen(false)}
              {...stylex.props(styles.ghostBtn)}
            >
              <Icon name="x" {...stylex.props(styles.closeIcon)} />
            </button>
          </div>

          <div {...stylex.props(styles.swatches)}>
            {FIELDS.map((field) => {
              const value = palette[field.key] ?? live[field.key] ?? '#000000';
              return (
                <div key={field.key} {...stylex.props(styles.field)}>
                  <span {...stylex.props(styles.label)}>{field.label}</span>
                  <div {...stylex.props(styles.swatchRow)}>
                    <input
                      type="color"
                      aria-label={field.label}
                      value={value}
                      onChange={(e) => set(field.key, e.target.value)}
                      {...stylex.props(styles.colorInput)}
                    />
                    <input
                      type="text"
                      aria-label={`${field.label} hex`}
                      value={value}
                      spellCheck={false}
                      onChange={(e) => set(field.key, e.target.value)}
                      {...stylex.props(styles.hexInput)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div {...stylex.props(styles.presets)}>
            {PALETTE_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => setPalette(preset.palette)}
                {...stylex.props(styles.preset)}
              >
                <span
                  {...stylex.props(styles.presetDot)}
                  style={{ backgroundColor: preset.palette.accent ?? '#6257E3' }}
                />
                {preset.name}
              </button>
            ))}
          </div>

          <p {...stylex.props(styles.note)}>
            Saved in this browser only — nobody else sees it, and nothing is written to the gym.
            Navigate around; every screen follows.
          </p>

          <div {...stylex.props(styles.actions)}>
            <span {...stylex.props(styles.spacer)} />
            <button
              type="button"
              onClick={() => setPalette({})}
              disabled={customCount === 0}
              {...stylex.props(styles.ghostBtn)}
            >
              Reset to theme
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        {...stylex.props(styles.pill)}
      >
        <span {...stylex.props(styles.pillDot)} />
        {customCount === 0 ? 'Colours' : `Colours · ${customCount}`}
      </button>
    </div>
  );
}
