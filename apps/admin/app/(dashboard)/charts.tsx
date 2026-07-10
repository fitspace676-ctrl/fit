'use client';

// @fit/admin — brand-themed data-viz for the console dashboard + analytics (T11.18).
//
// The dashboard/analytics charts rebuilt on the Fit brand Astryx tokens + compiled
// StyleX: a gradient area chart, a progress donut and a value/cap occupancy meter,
// every stroke/fill drawn from `var(--color-accent)` and the semantic status
// tokens (`--color-success` → `--color-warning` → `--color-error`) — no Tailwind
// utilities and no FormaCore palette. Kept dependency-free (inline SVG) like the
// screens they replace, so there is no Recharts runtime to theme; the SVG colours
// resolve through `currentColor` off a StyleX `color` so `light-dark()` tracks the
// active theme automatically.

import { Fragment, useEffect, useId, useState, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  areaSvg: {
    width: '100%',
  },
  // The line + gradient stops resolve their paint from `color` via currentColor.
  accentInk: {
    color: 'var(--color-accent)',
  },
  donutWrap: {
    position: 'relative',
    display: 'inline-grid',
    placeItems: 'center',
  },
  donutSvg: {
    transform: 'rotate(-90deg)',
  },
  donutTrack: {
    color: 'var(--color-background-muted)',
  },
  donutValue: {
    color: 'var(--color-accent)',
    transitionProperty: 'stroke-dasharray',
    transitionDuration: '900ms',
    transitionTimingFunction: 'ease-out',
  },
  donutCenter: {
    position: 'absolute',
    insetInline: 0,
    insetBlock: 0,
    display: 'grid',
    placeItems: 'center',
    textAlign: 'center',
  },
  occ: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  occHead: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  occValue: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.5rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  occCap: {
    fontSize: '1rem',
    color: 'var(--color-text-secondary)',
  },
  occPct: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  occTrack: {
    height: '0.5rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
  },
  occFill: {
    height: '100%',
    borderRadius: 'var(--radius-full)',
    transitionProperty: 'width',
    transitionDuration: '700ms',
    transitionTimingFunction: 'ease-out',
  },
  occFillOk: { backgroundColor: 'var(--color-success)' },
  occFillWarn: { backgroundColor: 'var(--color-warning)' },
  occFillFull: { backgroundColor: 'var(--color-error)' },
});

/* -------------------------------------------------------------------------- */
/*  AreaChart                                                                   */
/* -------------------------------------------------------------------------- */

/** One plotted point of an {@link AreaChart}: an x-axis label and its value. */
export interface AreaPoint {
  label: string;
  value: number;
}

/**
 * A compact, dependency-free area/line chart on the Fit brand accent. Renders a
 * gradient-filled area under a brand stroke, scaled to the data's own max, inside a
 * responsive `viewBox` so it fills its container. An all-zero (or empty) series
 * draws a flat baseline, so the caller can still show the frame with an empty-state
 * caption rather than a broken chart.
 */
export function AreaChart({
  data,
  height = 180,
  ariaLabel = 'Area chart',
}: {
  data: AreaPoint[];
  height?: number;
  ariaLabel?: string;
}) {
  const width = 640;
  const pad = 8;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;

  // x across the full width; y inverted (SVG origin is top-left), padded so the
  // stroke never clips at the extremes.
  const xy = data.map((d, i) => {
    const x = n <= 1 ? width / 2 : (i / (n - 1)) * (width - pad * 2) + pad;
    const y = height - pad - (d.value / max) * (height - pad * 2);
    return { x, y };
  });

  const line = xy
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const first = xy[0];
  const last = xy[xy.length - 1];
  const area =
    first && last
      ? `${line} L${last.x.toFixed(1)},${height - pad} L${first.x.toFixed(1)},${height - pad} Z`
      : '';
  // `useId()` yields a document-unique, SSR-safe id; strip the framework's `:`
  // delimiters so it is a valid `url(#…)` fragment reference.
  const gradientId = `area-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      {...stylex.props(styles.areaSvg)}
      style={{ height }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            {...stylex.props(styles.accentInk)}
            stopColor="currentColor"
            stopOpacity={0.32}
          />
          <stop
            offset="100%"
            {...stylex.props(styles.accentInk)}
            stopColor="currentColor"
            stopOpacity={0}
          />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#${gradientId})`} stroke="none" />}
      {line && (
        <path
          d={line}
          fill="none"
          {...stylex.props(styles.accentInk)}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Donut                                                                       */
/* -------------------------------------------------------------------------- */

/** A circular progress ring with a center slot, animated on mount/value change. */
export function Donut({
  pct,
  size = 104,
  stroke = 10,
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const [draw, setDraw] = useState(0);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  useEffect(() => {
    const id = requestAnimationFrame(() => setDraw(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  return (
    <div {...stylex.props(styles.donutWrap)} style={{ width: size, height: size }}>
      <svg width={size} height={size} {...stylex.props(styles.donutSvg)}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          {...stylex.props(styles.donutTrack)}
          stroke="currentColor"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          {...stylex.props(styles.donutValue)}
          stroke="currentColor"
          strokeDasharray={`${(draw / 100) * circ} ${circ}`}
        />
      </svg>
      <div {...stylex.props(styles.donutCenter)}>{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Occupancy                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A "value / cap" header over an animated fill bar, colour-coded by how full it is
 * (success → warning → error). Used for live gym occupancy per area.
 */
export function OccupancyBar({ value, cap }: { value: number; cap: number }) {
  const pct = cap > 0 ? Math.round((value / cap) * 100) : 0;
  const fill = pct > 85 ? styles.occFillFull : pct > 60 ? styles.occFillWarn : styles.occFillOk;
  return (
    <div {...stylex.props(styles.occ)}>
      <div {...stylex.props(styles.occHead)}>
        <p {...stylex.props(styles.occValue)}>
          {value}
          <span {...stylex.props(styles.occCap)}>/{cap}</span>
        </p>
        <span {...stylex.props(styles.occPct)}>{pct}%</span>
      </div>
      <div {...stylex.props(styles.occTrack)}>
        <div {...stylex.props(styles.occFill, fill)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  BarChart                                                                    */
/* -------------------------------------------------------------------------- */

const barStyles = stylex.create({
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(6rem, 9rem) 1fr auto',
    alignItems: 'center',
    gap: '0.75rem',
  },
  label: {
    overflow: 'hidden',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  track: {
    height: '0.625rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
  },
  fill: {
    height: '100%',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
    transitionProperty: 'width',
    transitionDuration: '700ms',
    transitionTimingFunction: 'ease-out',
  },
  value: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  empty: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

/** One bar of a {@link BarChart}: a category label and its value. */
export interface BarDatum {
  label: string;
  value: number;
}

/**
 * A compact, dependency-free horizontal bar chart on the Fit brand accent. Each
 * category is a row — its label, a track+fill scaled to the series max, and the
 * formatted value — so it reads for money, counts, and percentages alike via the
 * optional `formatValue`. An empty series renders the caller's `emptyLabel` rather
 * than a broken frame.
 */
export function BarChart({
  data,
  formatValue = (value) => String(value),
  emptyLabel = 'No data in this range.',
}: {
  data: BarDatum[];
  formatValue?: (value: number) => string;
  emptyLabel?: string;
}) {
  if (data.length === 0) {
    return <p {...stylex.props(barStyles.empty)}>{emptyLabel}</p>;
  }
  const max = Math.max(1, ...data.map((datum) => Math.abs(datum.value)));
  return (
    <div {...stylex.props(barStyles.wrap)}>
      {data.map((datum) => (
        <div key={datum.label} {...stylex.props(barStyles.row)}>
          <span {...stylex.props(barStyles.label)} title={datum.label}>
            {datum.label}
          </span>
          <span {...stylex.props(barStyles.track)}>
            <span
              {...stylex.props(barStyles.fill)}
              style={{ width: `${Math.max(2, (Math.abs(datum.value) / max) * 100)}%` }}
            />
          </span>
          <span {...stylex.props(barStyles.value)}>{formatValue(datum.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Heatmap                                                                     */
/* -------------------------------------------------------------------------- */

const heatStyles = stylex.create({
  scroll: {
    overflowX: 'auto',
  },
  grid: {
    display: 'grid',
    gap: '2px',
    minWidth: 'max-content',
  },
  corner: {},
  colLabel: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    textAlign: 'center',
    color: 'var(--color-text-secondary)',
  },
  rowLabel: {
    paddingInlineEnd: '0.5rem',
    fontSize: '0.75rem',
    lineHeight: '1rem',
    textAlign: 'right',
    color: 'var(--color-text-secondary)',
  },
  cell: {
    width: '1rem',
    height: '1rem',
    borderRadius: '3px',
    // Brand accent, tinted per-cell by opacity set inline off the value.
    backgroundColor: 'var(--color-accent)',
  },
});

/**
 * A weekday × hour (or any rows × cols) peak-intensity heatmap on the brand accent.
 * Each cell's opacity scales with its value against the grid max, so denser periods
 * read darker; a zero cell is a faint track. Kept dependency-free (a CSS grid of
 * tinted squares) and horizontally scrollable so a 24-column hour grid never blows
 * out the card on narrow screens.
 */
export function Heatmap({
  rowLabels,
  colLabels,
  cells,
  ariaLabel = 'Heatmap',
}: {
  rowLabels: string[];
  colLabels: string[];
  cells: number[][];
  ariaLabel?: string;
}) {
  const max = Math.max(1, ...cells.flat());
  const cols = colLabels.length;
  return (
    <div {...stylex.props(heatStyles.scroll)}>
      <div
        role="img"
        aria-label={ariaLabel}
        {...stylex.props(heatStyles.grid)}
        style={{ gridTemplateColumns: `auto repeat(${cols}, 1rem)` }}
      >
        <span {...stylex.props(heatStyles.corner)} />
        {colLabels.map((label, index) => (
          <span key={`col-${index}`} {...stylex.props(heatStyles.colLabel)}>
            {label}
          </span>
        ))}
        {rowLabels.map((rowLabel, rowIndex) => (
          <Fragment key={`row-${rowIndex}`}>
            <span {...stylex.props(heatStyles.rowLabel)}>{rowLabel}</span>
            {colLabels.map((_, colIndex) => {
              const value = cells[rowIndex]?.[colIndex] ?? 0;
              const intensity = value === 0 ? 0.06 : 0.12 + (value / max) * 0.88;
              return (
                <span
                  key={`cell-${rowIndex}-${colIndex}`}
                  {...stylex.props(heatStyles.cell)}
                  style={{ opacity: intensity }}
                  title={`${rowLabel} ${colLabels[colIndex]}: ${value}`}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
