import * as stylex from '@stylexjs/stylex';

// Astryx migration (T11.12): the classes surfaces share one brand-themed
// occupancy meter — a "booked / cap" header over a fill bar, colour-coded by how
// full the class is (success → warning → error) on the Fit brand status tokens.
// Authored in compiled StyleX (`var(--color-*)`) so the calendar, list, detail
// page, and drawer all read capacity identically without any Tailwind utility.

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  head: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  value: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '1rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  cap: {
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  pct: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  track: {
    height: '0.5rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
  },
  fill: {
    height: '100%',
    borderRadius: 'var(--radius-full)',
  },
  fillOk: { backgroundColor: 'var(--color-success)' },
  fillWarn: { backgroundColor: 'var(--color-warning)' },
  fillFull: { backgroundColor: 'var(--color-error)' },
});

export interface ClassOccupancyProps {
  /** Booked seats. */
  value: number;
  /** Total capacity. */
  cap: number;
  /** Extra StyleX styles for the root (e.g. a max-width). */
  xstyle?: stylex.StyleXStyles;
}

/**
 * A "value / cap" occupancy header over a fill bar, colour-coded by how full the
 * class is — rebuilt on the Astryx brand tokens (success → warning → error).
 * Stateless and framework-free so it renders the same on the server-rendered
 * detail page and the client calendar/list.
 */
export function ClassOccupancy({ value, cap, xstyle }: ClassOccupancyProps) {
  const pct = cap > 0 ? Math.round((value / cap) * 100) : 0;
  const fill = pct > 85 ? styles.fillFull : pct > 60 ? styles.fillWarn : styles.fillOk;
  return (
    <div {...stylex.props(styles.root, xstyle)}>
      <div {...stylex.props(styles.head)}>
        <p {...stylex.props(styles.value)}>
          {value}
          <span {...stylex.props(styles.cap)}>/{cap}</span>
        </p>
        <span {...stylex.props(styles.pct)}>{pct}%</span>
      </div>
      <div {...stylex.props(styles.track)}>
        <div {...stylex.props(styles.fill, fill)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
