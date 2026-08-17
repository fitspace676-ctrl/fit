import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';

/**
 * A status dot — the smallest state marker in the product.
 *
 * The console uses it where a chip would be too heavy: beside a staff member's
 * name to say "on shift", in a legend, on an invite row. It carries no text, so
 * it is `aria-hidden` by construction and the state it marks must ALSO be stated
 * in words nearby. A colour alone is not a status a screen reader can read, and
 * it is not one a colour-blind reader can read either.
 *
 * Tones are the direction's three signals plus the one red, matching `Badge`, so
 * a dot and a chip describing the same state cannot disagree. The old `Dot` took
 * a raw Tailwind class (`c="bg-emerald-500"`), which is how nine different
 * greens ended up in the console.
 */

const styles = stylex.create({
  base: {
    display: 'inline-block',
    flexShrink: 0,
    height: '0.375rem',
    width: '0.375rem',
    borderRadius: 'var(--radius-full)',
  },
  /** Live / on shift / confirmed. */
  positive: { backgroundColor: 'var(--color-accent)' },
  /** Idle, pending, invited. */
  pending: { backgroundColor: 'var(--color-icon-secondary)' },
  /** Off, unknown, not applicable. */
  neutral: { backgroundColor: 'var(--color-icon-disabled)' },
  /** Failed, expired, blocked. */
  danger: { backgroundColor: 'var(--color-error)' },
});

export type DotTone = 'positive' | 'pending' | 'neutral' | 'danger';

export interface DotProps {
  /** @default 'neutral' */
  tone?: DotTone;
  xstyle?: StyleXStyles;
}

export function Dot({ tone = 'neutral', xstyle }: DotProps) {
  return <span aria-hidden {...stylex.props(styles.base, styles[tone], xstyle)} />;
}
