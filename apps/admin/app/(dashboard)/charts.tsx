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
  // The chart is an SVG under an HTML overlay. Everything that must keep its
  // shape — markers, chips, the crosshair, the tooltip — lives in the overlay,
  // because the SVG stretches (`preserveAspectRatio="none"`) and would squash a
  // circle into an ellipse and a label into italics.
  plot: {
    position: 'relative',
    width: '100%',
    // A top-light behind the plot. It is what stops a chart reading as a sticker
    // ON the card and starts it reading as part of it — the depth cue the flat
    // fill was missing. Two percent of the accent, which is under the threshold
    // where it becomes a colour of its own.
    backgroundImage: 'radial-gradient(120% 80% at 50% 0%, var(--chart-glow-1) 0%, transparent 62%)',
    backgroundBlendMode: 'screen',
  },
  areaSvg: {
    width: '100%',
    display: 'block',
  },
  overlay: {
    position: 'absolute',
    insetInline: 0,
    insetBlock: 0,
    pointerEvents: 'none',
  },
  marker: {
    position: 'absolute',
    width: '0.5rem',
    height: '0.5rem',
    marginLeft: '-0.25rem',
    marginTop: '-0.25rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--chart-series-1)',
    // The 2px surface ring that keeps a mark legible where it overlaps its own
    // line — the spacer rule from the dataviz mark specs.
    boxShadow: '0 0 0 2px var(--color-background-card)',
  },
  chip: {
    position: 'absolute',
    transform: 'translate(-50%, -140%)',
    whiteSpace: 'nowrap',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    backgroundColor: 'var(--color-background-popover)',
    paddingInline: '0.5rem',
    paddingBlock: '0.1875rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  crosshair: {
    position: 'absolute',
    insetBlock: 0,
    width: '1px',
    backgroundColor: 'var(--chart-guide)',
  },
  tooltip: {
    position: 'absolute',
    top: 0,
    transform: 'translateX(-50%)',
    whiteSpace: 'nowrap',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    backgroundColor: 'var(--color-background-popover)',
    boxShadow: 'var(--shadow-high)',
    paddingInline: '0.5rem',
    paddingBlock: '0.375rem',
    fontSize: '0.6875rem',
    color: 'var(--color-text-primary)',
  },
  tooltipLabel: {
    display: 'block',
    fontFamily: 'var(--font-family-code)',
    color: 'var(--color-text-secondary)',
  },
  // The mean line's own label, sat at the right edge of the plot.
  guideLabel: {
    position: 'absolute',
    right: 0,
    transform: 'translateY(-50%)',
    paddingInline: '0.25rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-background-card)',
  },
  seriesOne: { color: 'var(--chart-series-1)' },
  seriesTwo: { color: 'var(--chart-series-2)' },
  glowOne: { color: 'var(--chart-glow-1)' },
  guideInk: { color: 'var(--chart-guide)' },
  // The line + gradient stops resolve their paint from `color` via currentColor.
  accentInk: {
    color: 'var(--chart-series-1)',
  },
  // The comparison chart's second series where that series is money going back
  // out — refunds, cancellations. Semantic, not decorative.
  negativeInk: {
    color: 'var(--color-error)',
  },
  // The comparison chart's second series where BOTH series are ordinary figures
  // being compared — two revenue streams, say. The error tone would claim the
  // second one is a problem, which is a statement the chart has no business
  // making; the accent would make it indistinguishable from the first.
  //
  // This is the VALIDATED series-2 token, not a hand-picked hue: the pastel teal
  // that used to sit here scored ΔE 13.8 against series 1 for normal vision,
  // below the 15 floor. See `globals.css`.
  neutralInk: {
    color: 'var(--chart-series-2)',
  },
  gaugeWrap: {
    position: 'relative',
    display: 'inline-grid',
    placeItems: 'center',
    // Its own compositing layer, so the two transitioning arcs do not repaint the
    // card behind them on every frame.
    transform: 'translateZ(0)',
  },
  gaugeSvg: {
    width: '100%',
    height: '100%',
  },
  gaugeCenter: {
    position: 'absolute',
    insetInline: 0,
    insetBlock: 0,
    display: 'grid',
    placeItems: 'center',
    textAlign: 'center',
  },
  gaugePercent: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
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
  // The KPI-tile sparkline. It is pinned to the tile's bottom edge and bleeds
  // into both corners — `overflow: hidden` on the strip is what trims it to the
  // container's radius. `pointerEvents: none` because the tile may be a link and
  // the chart must never eat the click.
  spark: {
    position: 'absolute',
    insetInline: 0,
    bottom: 0,
    width: '100%',
    display: 'block',
    pointerEvents: 'none',
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

/* -------------------------------------------------------------------------- */
/*  Curve                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A smooth path through the points, as cubic Béziers.
 *
 * MONOTONE cubic (Fritsch-Carlson), not Catmull-Rom. The difference matters for
 * data rather than for looks: a Catmull-Rom spline bulges past its control
 * points, so between two small positive values it dips below both — and on a
 * revenue chart that draws a loss that never happened. Monotone cubic cannot
 * overshoot by construction: where the data turns, the tangent is flattened to
 * zero, and elsewhere the tangent is clamped to three times the smaller
 * neighbouring slope.
 *
 * Straight segments are still available by passing a single point, and a run of
 * two points degenerates to a line, which is correct — two points describe no
 * curvature.
 */
function smoothPath(points: readonly { x: number; y: number }[], open = 'M'): string {
  if (points.length === 0) return '';
  const [head, ...rest] = points;
  if (!head) return '';
  if (rest.length === 0) return `${open}${head.x.toFixed(1)},${head.y.toFixed(1)}`;

  // Secant slopes between consecutive points.
  const slopes: number[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const run = b.x - a.x;
    slopes.push(run === 0 ? 0 : (b.y - a.y) / run);
  }

  // Tangents: the average of the neighbouring slopes, flattened at every turn so
  // the curve cannot overshoot, then clamped to the Fritsch-Carlson limit.
  const tangents: number[] = points.map((_, i) => {
    const prev = slopes[i - 1];
    const next = slopes[i];
    if (prev === undefined) return next ?? 0;
    if (next === undefined) return prev;
    if (prev * next <= 0) return 0;
    const mid = (prev + next) / 2;
    const limit = 3 * Math.min(Math.abs(prev), Math.abs(next));
    return Math.sign(mid) * Math.min(Math.abs(mid), limit);
  });

  let d = `${open}${head.x.toFixed(1)},${head.y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const ma = tangents[i] ?? 0;
    const mb = tangents[i + 1] ?? 0;
    if (!a || !b) continue;
    const third = (b.x - a.x) / 3;
    const c1x = a.x + third;
    const c1y = a.y + ma * third;
    const c2x = b.x - third;
    const c2y = b.y - mb * third;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }
  return d;
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
 * A compact, dependency-free area/line chart. Renders a gradient-filled area under
 * a glowing series stroke, scaled to the data's own max, inside a responsive
 * `viewBox` so it fills its container. An all-zero (or empty) series draws a flat
 * baseline, so the caller can still show the frame with an empty-state caption
 * rather than a broken chart.
 *
 * Three things sit ON TOP of the SVG rather than inside it — the end marker, its
 * value chip, and the hover crosshair with its tooltip. The SVG stretches
 * (`preserveAspectRatio="none"`), which turns a circle into an ellipse and a text
 * label into italics; the overlay is plain HTML positioned in percentages, so it
 * keeps its shape at any width.
 *
 * The dashed line across the plot is the series MEAN. A trend without a reference
 * is a wiggle: the mean is what turns "it moved" into "it moved above where it
 * usually sits". It is drawn only when there are enough points for a mean to say
 * anything.
 */
export function AreaChart({
  data,
  height = 180,
  ariaLabel = 'Area chart',
  formatValue = (value) => String(value),
  showMean = true,
}: {
  data: AreaPoint[];
  height?: number;
  ariaLabel?: string;
  /** How the chip and the tooltip render a value. Money and percentages differ. */
  formatValue?: (value: number) => string;
  showMean?: boolean;
}) {
  const width = 640;
  const pad = 8;
  const [hover, setHover] = useState<number | null>(null);

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

  // Smoothed PER RUN: each unbroken stretch gets its own curve, so a gap still
  // breaks the stroke instead of being bridged by a Bézier that spans it.
  const runs: { x: number; y: number }[][] = [];
  for (const point of xy) {
    if (point === null) {
      if (runs[runs.length - 1]?.length) runs.push([]);
      continue;
    }
    if (runs.length === 0) runs.push([]);
    runs[runs.length - 1]?.push(point);
  }
  const line = runs
    .filter((run) => run.length > 0)
    .map((run) => smoothPath(run))
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
  const runLine = smoothPath(runPoints);
  const area =
    first && last
      ? `${runLine} L${last.x.toFixed(1)},${height - pad} L${first.x.toFixed(1)},${height - pad} Z`
      : '';
  // `useId()` yields a document-unique, SSR-safe id; strip the framework's `:`
  // delimiters so it is a valid `url(#…)` fragment reference.
  const gradientId = `area-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const mean =
    showMean && present.length > 2
      ? present.reduce((sum, d) => sum + d.value, 0) / present.length
      : null;
  const meanY = mean === null ? null : height - pad - (mean / max) * (height - pad * 2);

  // The last point that actually carries a value — the end marker's anchor, and
  // the only point on the chart that gets a label.
  const lastIndex = xy.reduce((found, point, i) => (point === null ? found : i), -1);
  const lastPoint = lastIndex === -1 ? null : xy[lastIndex];
  const lastValue = lastIndex === -1 ? null : (data[lastIndex]?.value ?? null);

  const hovered = hover === null ? null : xy[hover];
  const hoveredValue = hover === null ? null : (data[hover]?.value ?? null);

  /** Nearest bucket to the pointer, as a fraction of the plot's width. */
  function track(event: React.PointerEvent<HTMLDivElement>): void {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || n === 0) return;
    const ratio = (event.clientX - box.left) / box.width;
    setHover(Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1)))));
  }

  const pct = (x: number) => `${(x / width) * 100}%`;

  return (
    <div {...stylex.props(styles.plot)} onPointerMove={track} onPointerLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        {...stylex.props(styles.areaSvg)}
        style={{ height }}
      >
        <AccentAreaGradient id={gradientId} />
        {meanY !== null && (
          <line
            x1={pad}
            x2={width - pad}
            y1={meanY}
            y2={meanY}
            {...stylex.props(styles.guideInk)}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {area && <path d={area} fill={`url(#${gradientId})`} stroke="none" />}
        {/*
          The glow: the same path again, wider and translucent, UNDER the stroke.
          A blur filter would look the same and cost a full-size offscreen buffer
          on every repaint; this costs one more path.
        */}
        {line && (
          <path
            d={line}
            fill="none"
            {...stylex.props(styles.glowOne)}
            stroke="currentColor"
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <SeriesPath d={line} ink={styles.seriesOne} />
      </svg>

      <div {...stylex.props(styles.overlay)}>
        {meanY !== null && mean !== null && (
          <span {...stylex.props(styles.guideLabel)} style={{ top: `${(meanY / height) * 100}%` }}>
            {formatValue(Math.round(mean))}
          </span>
        )}
        {lastPoint && lastValue !== null && hover === null && (
          <>
            <span
              {...stylex.props(styles.marker)}
              style={{ left: pct(lastPoint.x), top: `${(lastPoint.y / height) * 100}%` }}
            />
            <span
              {...stylex.props(styles.chip)}
              style={{ left: pct(lastPoint.x), top: `${(lastPoint.y / height) * 100}%` }}
            >
              {formatValue(lastValue)}
            </span>
          </>
        )}
        {hovered && (
          <>
            <span {...stylex.props(styles.crosshair)} style={{ left: pct(hovered.x) }} />
            <span
              {...stylex.props(styles.marker)}
              style={{ left: pct(hovered.x), top: `${(hovered.y / height) * 100}%` }}
            />
          </>
        )}
        {hover !== null && hoveredValue !== null && (
          <span {...stylex.props(styles.tooltip)} style={{ left: pct(xy[hover]?.x ?? 0) }}>
            <span {...stylex.props(styles.tooltipLabel)}>{data[hover]?.label}</span>
            {formatValue(hoveredValue)}
          </span>
        )}
      </div>
    </div>
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
/*  AnimatedCircularProgressBar                                                 */
/* -------------------------------------------------------------------------- */

/** The gauge's geometry, in the SVG's own 0–100 user units. */
const GAUGE_RADIUS = 45;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;
/** How much of the ring one percent covers. */
const PERCENT_TO_PX = GAUGE_CIRCUMFERENCE / 100;
/** The break between the two arcs, in percent, so they never touch. */
const GAP_PERCENT = 5;

/**
 * Magic UI's `AnimatedCircularProgressBar`, authored in StyleX.
 *
 * The upstream component is Tailwind-classed, and both this file and the overview
 * that renders it are on the Tailwind guardrail's migrated manifest
 * (`scripts/check-tailwind-guardrail.ts`) — a `className="size-full"` here would
 * fail CI and re-introduce the dependency the decommission is removing. So the
 * geometry, the custom properties and the transitions are transcribed rather than
 * installed; what arrives on screen is the same gauge.
 *
 * Two arcs, drawn from opposite ends and separated by a gap: the primary sweeps
 * clockwise from twelve o'clock for `value`, and the secondary sweeps back for the
 * remainder, so the ring reads as a filled portion of a track rather than a stroke
 * on a circle. Both animate by transitioning `stroke-dasharray`, which is why the
 * percent lives in a custom property rather than in the path data.
 *
 * `children` replaces the default percent readout — the occupancy card shows a
 * count against a capacity, which is the figure that card is about.
 */
export function AnimatedCircularProgressBar({
  value,
  min = 0,
  max = 100,
  size = 104,
  stroke = 10,
  primaryColor = 'var(--color-accent)',
  secondaryColor = 'var(--color-background-muted)',
  ariaLabel,
  children,
}: {
  value: number;
  min?: number;
  max?: number;
  size?: number;
  stroke?: number;
  primaryColor?: string;
  secondaryColor?: string;
  ariaLabel?: string;
  children?: ReactNode;
}) {
  const span = max - min;
  const percent =
    span <= 0 ? 0 : Math.min(100, Math.max(0, Math.round(((value - min) / span) * 100)));

  const shared = {
    cx: 50,
    cy: 50,
    r: GAUGE_RADIUS,
    strokeWidth: stroke,
    strokeDashoffset: 0,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;

  return (
    <div
      {...stylex.props(styles.gaugeWrap)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel}
    >
      <svg fill="none" viewBox="0 0 100 100" {...stylex.props(styles.gaugeSvg)}>
        {/*
          The remainder, drawn backwards from twelve o'clock (`scaleY(-1)`) so the
          two arcs meet at the value rather than overlapping. Omitted above 90% —
          at that point the gap has eaten what would be left of it.
        */}
        {percent <= 90 ? (
          <circle
            {...shared}
            style={{
              stroke: secondaryColor,
              strokeDasharray: `${(90 - percent) * PERCENT_TO_PX}px ${GAUGE_CIRCUMFERENCE}px`,
              transform: `rotate(calc(1turn - 90deg - ${GAP_PERCENT * 3.6}deg)) scaleY(-1)`,
              transformOrigin: '50px 50px',
              transition: 'all 1s ease 0s',
            }}
          />
        ) : null}
        {/*
          Omitted at zero. A round cap on a zero-length dash still paints a dot,
          so an empty gym drew a mark at twelve o'clock that reads as one person
          — or as a smudge. Upstream has the same artefact; an occupancy gauge
          cannot afford it, because zero is the number this card shows most.
        */}
        {percent > 0 ? (
          <circle
            {...shared}
            style={{
              stroke: primaryColor,
              strokeDasharray: `${percent * PERCENT_TO_PX}px ${GAUGE_CIRCUMFERENCE}px`,
              transform: 'rotate(-90deg)',
              transformOrigin: '50px 50px',
              transition: 'all 1s ease 0s, stroke 1s linear',
            }}
          />
        ) : null}
      </svg>
      <span {...stylex.props(styles.gaugeCenter)}>
        {children ?? <span {...stylex.props(styles.gaugePercent)}>{percent}</span>}
      </span>
    </div>
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
  // No filled track behind the bar. A full-width grey slab reads as a second
  // value at 100% and competes with the mark it is supposed to frame; the row's
  // own width already says what the maximum is. A hairline keeps the baseline
  // legible when every bar is short.
  track: {
    height: '0.625rem',
    display: 'flex',
    alignItems: 'center',
    borderRadius: 'var(--radius-full)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--chart-guide)',
  },
  fill: {
    height: '0.5rem',
    // Rounded at the DATA end only: the bar grows from a baseline it stays
    // anchored to, and a rounded root would float it off that line.
    borderStartStartRadius: 0,
    borderEndStartRadius: 0,
    borderStartEndRadius: '4px',
    borderEndEndRadius: '4px',
    backgroundColor: 'var(--chart-series-1)',
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

/* -------------------------------------------------------------------------- */
/*  Sparkline                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The micro-chart that bleeds off the bottom edge of a KPI tile.
 *
 * It has no axes, no labels, no hover and no tooltip, and that is the whole
 * point: it answers "which way has this been going" and nothing else. The number
 * above it is the fact; this is the shape of how it got there. Anything more
 * would compete with the numeral.
 *
 * Scaled from ZERO to the series max, exactly like {@link AreaChart} — not from
 * min to max. Min-max would stretch a series that sat between 980 and 1000 into
 * a dramatic climb, which is the classic way a sparkline lies. Nulls keep their
 * x slot and break the stroke, same as the full chart.
 *
 * Positioned by the caller: it expects to be laid over the tile with the tile
 * itself supplying `position: relative` and the tile's own padding keeping the
 * text clear of it.
 */
export function Sparkline({ values, height = 34 }: { values: (number | null)[]; height?: number }) {
  const width = 160;
  const gradientId = `spark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const present = values.filter((v): v is number => v !== null);
  // A series that is entirely null, or flat at zero, has no shape to draw. An
  // empty box beats a straight line pinned to the floor, which reads as data.
  if (present.length < 2 || Math.max(...present) <= 0) return null;

  const max = Math.max(...present);
  const n = values.length;
  // No padding on x: the line runs edge to edge, so the tile's own bottom corner
  // clips it. `1` of top padding keeps the 2px stroke's peak from being sheared.
  const xy = values.map((value, i) => {
    const x = n <= 1 ? width / 2 : (i / (n - 1)) * width;
    return value === null ? null : { x, y: height - 1 - (value / max) * (height - 2) };
  });

  const runs: { x: number; y: number }[][] = [];
  for (const point of xy) {
    if (point === null) {
      if (runs[runs.length - 1]?.length) runs.push([]);
      continue;
    }
    if (runs.length === 0) runs.push([]);
    runs[runs.length - 1]?.push(point);
  }
  const drawn = runs.filter((run) => run.length > 0);
  const line = drawn.map((run) => smoothPath(run)).join(' ');

  // Filled under the first run only — the same rule the full chart follows, for
  // the same reason: a fill closed across a gap shades a region with no data.
  const firstRun = drawn[0] ?? [];
  const first = firstRun[0];
  const last = firstRun[firstRun.length - 1];
  const area =
    first && last
      ? `${smoothPath(firstRun)} L${last.x.toFixed(1)},${height} L${first.x.toFixed(1)},${height} Z`
      : '';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      {...stylex.props(styles.spark)}
      style={{ height }}
    >
      <AccentAreaGradient id={gradientId} />
      {area && <path d={area} fill={`url(#${gradientId})`} stroke="none" />}
      {line && (
        <path
          d={line}
          fill="none"
          {...stylex.props(styles.seriesOne)}
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
