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

import { useEffect, useId, useState, type ReactNode } from 'react';
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
