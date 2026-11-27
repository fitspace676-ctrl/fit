'use client';

import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Icon, type IconName } from '@/components/ui';

const styles = stylex.create({
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.875rem',
    fontWeight: 700,
    letterSpacing: '-0.005em',
    color: 'var(--color-text-primary)',
  },
  spaced: {
    marginBottom: '1rem',
  },
  chip: {
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    width: '1.875rem',
    height: '1.875rem',
    borderRadius: 'var(--radius-inner)',
    color: 'var(--brand-ink)',
    backgroundColor: 'var(--brand-tint)',
  },
  glyph: {
    width: '1rem',
    height: '1rem',
  },
});

/** A dashboard card's heading: a brand-tinted glyph tile, then the title. */
export function CardTitle({
  icon,
  spaced,
  children,
}: {
  icon: IconName;
  /** Adds the gap below when the title stands alone rather than in a header row. */
  spaced?: boolean;
  children: ReactNode;
}) {
  return (
    <h2 {...stylex.props(styles.title, spaced && styles.spaced)}>
      <span aria-hidden {...stylex.props(styles.chip)}>
        <Icon name={icon} {...stylex.props(styles.glyph)} />
      </span>
      {children}
    </h2>
  );
}
