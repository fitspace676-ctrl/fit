import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { Icon, type IconName } from '@fit/ui-web';

/**
 * An inline message above — or instead of — the thing it reports on.
 *
 * `error` is announced as an `alert` because it interrupts what the reader was
 * doing; `success` and `info` are a `status`, which screen readers queue rather
 * than cut in with. The role follows the tone rather than being a separate prop,
 * so the two cannot be set inconsistently.
 */

const styles = stylex.create({
  base: {
    margin: 0,
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.625rem',
    borderRadius: 'var(--radius-inner)',
    padding: '1rem',
    fontSize: '0.8125rem',
    fontWeight: 500,
    lineHeight: 1.6,
  },
  error: {
    backgroundColor: 'var(--color-error-muted)',
    color: 'var(--color-text-red)',
  },
  /**
   * Good news gets the lime — the one colour the direction lets a positive state
   * use. A TINT with a hairline rather than a fill: a solid lime panel here would
   * outweigh the form it is reporting on.
   */
  success: {
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 22%, transparent)',
    color: 'var(--color-text-primary)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 45%, transparent)',
  },
  info: {
    backgroundColor: 'var(--fc-tile)',
    color: 'var(--color-text-secondary)',
    boxShadow: 'inset 0 0 0 1px var(--color-border)',
  },
  icon: {
    marginTop: '0.125rem',
    flexShrink: 0,
    width: '1rem',
    height: '1rem',
  },
  iconError: { color: 'var(--color-icon-red)' },
  iconSuccess: { color: 'var(--color-text-accent)' },
  iconInfo: { color: 'var(--color-icon-secondary)' },
});

export type BannerTone = 'error' | 'success' | 'info';

const GLYPH: Record<BannerTone, IconName> = {
  error: 'info',
  success: 'check',
  info: 'info',
};

const ICON_TONE = {
  error: styles.iconError,
  success: styles.iconSuccess,
  info: styles.iconInfo,
} as const;

export interface BannerProps {
  tone: BannerTone;
  children: ReactNode;
  xstyle?: StyleXStyles;
}

export function Banner({ tone, children, xstyle }: BannerProps) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      {...stylex.props(styles.base, styles[tone], xstyle)}
    >
      <Icon name={GLYPH[tone]} sw={2.2} {...stylex.props(styles.icon, ICON_TONE[tone])} />
      {children}
    </p>
  );
}
