'use client';

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/components/theme/theme-provider';
import type { Theme } from '@/lib/theme';

// The sign-in door's light/dark switch - the same two-up segmented control the
// member door renders, restated here because it sits ON THE PHOTO: the panel is
// dark in both modes, so the track carries its own white-alpha border and dark
// fill instead of the theme's control tokens, which would go white in light
// mode and punch a hole in the picture.

const MODES: readonly {
  key: Theme;
  icon: 'moon' | 'sun';
  label: 'switchToDark' | 'switchToLight';
}[] = [
  { key: 'dark', icon: 'moon', label: 'switchToDark' },
  { key: 'light', icon: 'sun', label: 'switchToLight' },
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
    borderColor: 'rgba(255, 255, 255, 0.16)',
    backgroundColor: 'rgba(19, 19, 18, 0.55)',
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
    color: { default: 'rgba(255, 255, 255, 0.64)', ':hover': '#FFFFFF' },
  },
  active: {
    backgroundColor: 'var(--color-accent)',
    // The brand gradient in light mode, flat accent in dark (see globals.css).
    backgroundImage: 'var(--brand-fill-image, none)',
    color: 'var(--color-on-accent)',
  },
  icon: {
    height: '1.0625rem',
    width: '1.0625rem',
  },
});

/** The photo-panel segmented control that flips the console between light and dark. */
export function LoginThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations('admin.common');

  return (
    <div {...stylex.props(styles.track)} role="group">
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
