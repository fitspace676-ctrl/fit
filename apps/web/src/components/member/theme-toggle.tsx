'use client';

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Icon } from '@/src/components/ui';
import { useTheme } from '@/src/components/theme/theme-provider';
import { type Theme } from '@/src/lib/theme';

// FormaCore redesign (T11.10) — a two-up SEGMENTED CONTROL, not a single toggle.
//
// The artboards put both modes on screen at once: a 40px bordered track holding
// two 32px buttons, the current one filled lime. That is a deliberate difference
// from the sun/moon button this replaces. A lone toggle shows the mode you are
// about to switch TO, which readers routinely misread as the mode they are in;
// the segmented form states the current mode and offers the other, so there is
// nothing to infer. It also gives the control a fixed footprint, so the header
// does not reflow when the icon swaps.

const MODES: readonly {
  key: Theme;
  icon: 'moon' | 'sun';
  label: 'themeToDark' | 'themeToLight';
}[] = [
  { key: 'dark', icon: 'moon', label: 'themeToDark' },
  { key: 'light', icon: 'sun', label: 'themeToLight' },
];

const styles = stylex.create({
  track: {
    display: 'flex',
    height: '2.5rem',
    alignItems: 'center',
    gap: '0.125rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--fc-tile-border)',
    backgroundColor: 'var(--fc-control)',
    padding: '0.25rem',
  },
  segment: {
    display: 'grid',
    placeItems: 'center',
    height: '2rem',
    width: '2rem',
    borderRadius: 'calc(var(--radius-inner) - 0.25rem)',
    borderWidth: 0,
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  idle: {
    backgroundColor: 'transparent',
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
  },
  active: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  icon: {
    height: '1.0625rem',
    width: '1.0625rem',
  },
});

/** The header segmented control that flips the portal between light and dark. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations('member.shell');

  return (
    <div {...stylex.props(styles.track)} role="group" aria-label={t('menu')}>
      {MODES.map((mode) => {
        const current = theme === mode.key;
        return (
          <button
            key={mode.key}
            type="button"
            onClick={() => setTheme(mode.key)}
            aria-pressed={current}
            aria-label={t(mode.label)}
            title={t(mode.label)}
            {...stylex.props(styles.segment, current ? styles.active : styles.idle)}
          >
            <Icon name={mode.icon} {...stylex.props(styles.icon)} />
          </button>
        );
      })}
    </div>
  );
}
