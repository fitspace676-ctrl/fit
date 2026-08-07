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
  // The comparison chart's second series where that series is money going back
  // out — refunds, cancellations. Semantic, not decorative.
  negativeInk: {
    color: 'var(--color-error)',
  },
  // The comparison chart's second series where BOTH series are ordinary figures
  // being compared — two revenue streams, say. The error tone would claim the
  // second one is a problem, which is a statement the chart has no business making.
  neutralInk: {
    color: 'var(--color-brand)',
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

/**
 * The accent gradient both area charts fill under: opaque-ish at the top, clear
 * at the baseline. Rendered inside its own `<defs>` so a caller only has to place
 * it and reference `id`. The colour resolves through `currentColor` off a StyleX
 * `color`, so `light-dark()` tracks the active theme automatically.
 */
function AccentAreaGradient({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
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
  );
}

/**
 * One plotted series stroke. `ink` is a StyleX style supplying the `color` the
 * stroke reads through `currentColor` — `styles.accentInk` for a primary series,
 * `styles.negativeInk` for a comparison overlay. Renders nothing for an empty
 * path, so callers can pass an unguarded `''`.
 */
function SeriesPath({ d, ink }: { d: string; ink: stylex.StyleXStyles }) {
  if (!d) return null;
  return (
    <path
      d={d}
      fill="none"
      {...stylex.props(ink)}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  );
}

/** One plotted point of an {@link AreaChart}: an x-axis label and its value. */
export interface AreaPoint {
  label: string;
  /**
   * The plotted value, or `null` for a bucket the series has no figure for. A
   * null is NOT zero: the chart leaves a gap rather than drawing a line through a
   * number that was never measured. Retention uses this for a window with no
   * cohort to retain.
   */
  value: number | null;
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
  // This filter is for TYPE SAFETY, not scale correctness: `Math.max(1, …)`
  // floors the result, so a coerced `null → 0` could never have displaced the
  // maximum anyway (0 loses to any positive value, and a negative series is
  // floored to 1 first). Without the filter `data.map((d) => d.value)` is a
  // `(number | null)[]`, which `Math.max` can't accept — that's the actual
  // reason it's here. Don't delete it and reach for `?? 0` to satisfy the
  // compiler; that would quietly reintroduce null-as-zero elsewhere.
  const present = data.filter((d): d is AreaPoint & { value: number } => d.value !== null);
  const max = Math.max(1, ...present.map((d) => d.value));
  const n = data.length;

  // x across the full width; y inverted (SVG origin is top-left), padded so the
  // stroke never clips at the extremes. A null point keeps its x slot — the gap
  // has to sit where the missing bucket actually is.
  const xy = data.map((d, i) => {
    const x = n <= 1 ? width / 2 : (i / (n - 1)) * (width - pad * 2) + pad;
    return d.value === null ? null : { x, y: height - pad - (d.value / max) * (height - pad * 2) };
  });

  // One `M…L…` run per unbroken stretch, so the stroke restarts after each gap
  // instead of bridging it. The `==` is deliberate, not a typo: at `i === 0`,
  // `xy[i - 1]` is `undefined` (out of bounds), and this needs to catch that
  // alongside an actual `null` gap, so the point still opens with `M`.
  // Tightening it to `===` would silently break the first point's `M`.
  const line = xy
    .map((p, i) =>
      p === null ? '' : `${xy[i - 1] == null ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`,
    )
    .join(' ')
    .trim();

  // The gradient fills under the FIRST unbroken run only. Closing a fill across a
  // gap would shade a region the data does not cover.
  const runPoints: { x: number; y: number }[] = [];
  for (const point of xy) {
    if (point === null) {
      // The run has ended. Stop at the first gap rather than resuming after it.
      if (runPoints.length > 0) break;
      continue;
    }
    runPoints.push(point);
  }

  const first = runPoints[0];
  const last = runPoints[runPoints.length - 1];
  const runLine = runPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const area =
    first && last
      ? `${runLine} L${last.x.toFixed(1)},${height - pad} L${first.x.toFixed(1)},${height - pad} Z`
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
      <AccentAreaGradient id={gradientId} />
      {area && <path d={area} fill={`url(#${gradientId})`} stroke="none" />}
      <SeriesPath d={line} ink={styles.accentInk} />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  DualAreaChart                                                               */
/* -------------------------------------------------------------------------- */

/** One plotted bucket of a {@link DualAreaChart} — two values sharing an x. */
export interface DualPoint {
  label: string;
  primary: number;
  secondary: number;
}

/**
 * Two series over one x-axis, for comparisons where the pair only means anything
 * read together (sales against refunds). The primary series keeps
 * {@link AreaChart}'s gradient-filled accent treatment; the secondary is a
 * stroke-only overlay, so it reads as a line laid over the first rather than a
 * second competing area.
 *
 * `secondaryTone` says what that second series MEANS, and the default is the
 * original one: `negative` for money going back out, `neutral` where both series
 * are ordinary figures being compared. Drawing two healthy revenue streams with
 * one of them in the error tone would be the chart asserting a problem nobody
 * reported.
 *
 * Both series scale to the SHARED maximum. Scaling each to its own max would draw
 * a trivial refund column exactly as tall as a large sales one — the comparison
 * the chart exists to make would be the one thing it got wrong.
 */
export function DualAreaChart({
  data,
  height = 180,
  ariaLabel = 'Comparison chart',
  secondaryTone = 'negative',
}: {
  data: DualPoint[];
  height?: number;
  ariaLabel?: string;
  secondaryTone?: 'negative' | 'neutral';
}) {
  const width = 640;
  const pad = 8;
  const max = Math.max(1, ...data.flatMap((d) => [d.primary, d.secondary]));
  const n = data.length;

  const project = (value: number, i: number) => ({
    x: n <= 1 ? width / 2 : (i / (n - 1)) * (width - pad * 2) + pad,
    y: height - pad - (value / max) * (height - pad * 2),
  });

  const path = (pick: (d: DualPoint) => number) =>
    data
      .map((d, i) => {
        const p = project(pick(d), i);
        return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })
      .join(' ');

  const primaryLine = path((d) => d.primary);
  const secondaryLine = path((d) => d.secondary);
  const firstX = data.length > 0 ? project(0, 0).x : 0;
  const lastX = data.length > 0 ? project(0, data.length - 1).x : 0;
  const primaryArea =
    data.length > 0
      ? `${primaryLine} L${lastX.toFixed(1)},${height - pad} L${firstX.toFixed(1)},${height - pad} Z`
      : '';

  // `useId()` yields a document-unique, SSR-safe id; strip the framework's `:`
  // delimiters so it is a valid `url(#…)` fragment reference.
  const gradientId = `dual-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      {...stylex.props(styles.areaSvg)}
      style={{ height }}
    >
      <AccentAreaGradient id={gradientId} />
      {primaryArea && <path d={primaryArea} fill={`url(#${gradientId})`} stroke="none" />}
      <SeriesPath d={primaryLine} ink={styles.accentInk} />
      <SeriesPath
        d={secondaryLine}
        ink={secondaryTone === 'neutral' ? styles.neutralInk : styles.negativeInk}
      />
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
