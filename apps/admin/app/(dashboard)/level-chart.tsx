'use client';

// A level over time — a headcount, not a flow.
//
// Why not the area chart: a level drifting from 95 to 99 drawn on a zero-based
// axis is a flat line at the top of a big grey slab, and the change the reader
// came for is invisible. A level is read against its own range, so this axis is
// fitted to the data (with round ticks and their values printed), the line is
// straight segments between real buckets (a smoother would invent overshoot),
// and the first and last points carry their figures. Hovering names any day.
//
// No fill under the line on purpose: on an axis that does not start at zero, a
// filled area claims a magnitude the axis cannot back.

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { SingleBucket } from './single-bucket';

export interface LevelDatum {
  /** The bucket key, e.g. `2026-11-26`. */
  label: string;
  /** `null` is a bucket with no reading; the line breaks there. */
  value: number | null;
}

const VIEW_W = 1000;

const styles = stylex.create({
  wrap: { paddingTop: '1.25rem' },
  frame: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    columnGap: '0.625rem',
  },
  yAxis: {
    position: 'relative',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
    textAlign: 'end',
  },
  tick: {
    position: 'absolute',
    insetInlineEnd: 0,
    transform: 'translateY(-50%)',
    whiteSpace: 'nowrap',
  },
  tickSizer: { visibility: 'hidden', whiteSpace: 'nowrap' },
  plot: { position: 'relative' },
  grid: {
    position: 'absolute',
    insetInline: 0,
    height: 0,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--chart-guide)',
  },
  svg: {
    position: 'absolute',
    insetBlock: 0,
    insetInline: 0,
    width: '100%',
    height: '100%',
    overflow: 'visible',
    color: 'var(--chart-series-1)',
  },
  dot: {
    position: 'absolute',
    width: '0.625rem',
    height: '0.625rem',
    marginLeft: '-0.3125rem',
    marginTop: '-0.3125rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--chart-series-1)',
    boxShadow: '0 0 0 2px var(--color-background-card)',
    pointerEvents: 'none',
  },
  dotLabel: {
    position: 'absolute',
    transform: 'translateY(-170%)',
    paddingInline: '0.375rem',
    paddingBlock: '0.0625rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    color: 'var(--color-text-primary)',
    pointerEvents: 'none',
  },
  labelStart: { transform: 'translate(-10%, -170%)' },
  labelEnd: { transform: 'translate(-90%, -170%)' },
  labelPeak: { transform: 'translate(-50%, -170%)' },
  crosshair: {
    position: 'absolute',
    insetBlock: 0,
    width: '1px',
    backgroundColor: 'var(--chart-guide)',
    pointerEvents: 'none',
  },
  tooltip: {
    position: 'absolute',
    zIndex: 1,
    transform: 'translate(-50%, calc(-100% - 0.75rem))',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
    paddingInline: '0.625rem',
    paddingBlock: '0.375rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    backgroundColor: 'var(--color-background-popover)',
    boxShadow: 'var(--shadow-high)',
    fontSize: '0.6875rem',
    whiteSpace: 'nowrap',
    color: 'var(--color-text-primary)',
    pointerEvents: 'none',
  },
  tooltipDate: { color: 'var(--color-text-secondary)' },
  tooltipValue: {
    fontFamily: 'var(--font-family-code)',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  // Labels sit under their own point (points run edge to edge, not in slots).
  xAxis: {
    position: 'relative',
    height: '1rem',
    marginTop: '0.5rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
  xLabel: {
    position: 'absolute',
    top: 0,
    transform: 'translateX(-50%)',
    whiteSpace: 'nowrap',
  },
  xLabelFirst: { transform: 'none' },
  xLabelLast: { transform: 'translateX(-100%)' },
});

/** A round step (1/2/5 × 10ⁿ) that splits `span` into about four intervals. */
function niceStep(span: number, integer: boolean): number {
  const raw = span / 4;
  if (raw <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * power >= raw) ?? 10) * power;
  return integer ? Math.max(1, Math.round(step)) : step;
}

export function LevelChart({
  data,
  formatValue,
  formatLabel,
  ariaLabel,
  valueName,
  integer,
  height = 220,
}: {
  data: LevelDatum[];
  formatValue: (value: number) => string;
  formatLabel: (label: string) => string;
  ariaLabel: string;
  valueName: string;
  /** Counts: ticks land on whole numbers. */
  integer?: boolean;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;
  const present = data.filter((d): d is LevelDatum & { value: number } => d.value !== null);
  const lo = Math.min(...present.map((d) => d.value));
  const hi = Math.max(...present.map((d) => d.value));

  // Fit the axis to the data with a little air above and below, on round ticks.
  const step = niceStep(Math.max(hi - lo, integer ? 4 : 1e-9), Boolean(integer));
  const min = Math.floor((lo - step * 0.5) / step) * step;
  const max = Math.ceil((hi + step * 0.5) / step) * step;
  const ticks: number[] = [];
  for (let v = max; v >= min - step / 2; v -= step) ticks.push(Number(v.toFixed(6)));

  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => ((max - v) / (max - min)) * 100;

  // Straight segments, broken at every `null`.
  const runs: string[] = [];
  let current: string[] = [];
  data.forEach((d, i) => {
    if (d.value === null) {
      if (current.length) runs.push(current.join(' '));
      current = [];
      return;
    }
    current.push(
      `${current.length ? 'L' : 'M'}${((x(i) / 100) * VIEW_W).toFixed(1)},${y(d.value).toFixed(2)}`,
    );
  });
  if (current.length) runs.push(current.join(' '));

  const firstIndex = data.findIndex((d) => d.value !== null);
  const lastIndex = data.reduce((found, d, i) => (d.value === null ? found : i), -1);
  // The highest reading gets its figure too, unless it is already an end point.
  const peakIndex = data.reduce(
    (best, d, i) => (d.value !== null && d.value > (data[best]?.value ?? -Infinity) ? i : best),
    firstIndex,
  );
  const peak = peakIndex !== firstIndex && peakIndex !== lastIndex ? data[peakIndex] : undefined;
  const first = data[firstIndex];
  const last = data[lastIndex];
  const hovered = hover === null ? null : data[hover];
  const labelEvery = Math.max(1, Math.ceil(n / 8));

  function track(event: React.PointerEvent<HTMLDivElement>): void {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || n === 0) return;
    const ratio = (event.clientX - box.left) / box.width;
    setHover(Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1)))));
  }

  if (present.length === 0) return null;
  // One reading has no line to draw: say the figure instead.
  if (n === 1 && present[0]) {
    return <SingleBucket value={formatValue(present[0].value)} />;
  }

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.frame)}>
        <div aria-hidden {...stylex.props(styles.yAxis)} style={{ height }}>
          <span {...stylex.props(styles.tickSizer)}>{formatValue(max)}</span>
          {ticks.map((tick) => (
            <span key={tick} {...stylex.props(styles.tick)} style={{ top: `${y(tick)}%` }}>
              {formatValue(tick)}
            </span>
          ))}
        </div>

        <div
          role="img"
          aria-label={ariaLabel}
          {...stylex.props(styles.plot)}
          style={{ height }}
          onPointerMove={track}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              aria-hidden
              {...stylex.props(styles.grid)}
              style={{ top: `${y(tick)}%` }}
            />
          ))}

          <svg
            viewBox={`0 0 ${VIEW_W} 100`}
            preserveAspectRatio="none"
            aria-hidden
            {...stylex.props(styles.svg)}
          >
            {runs.map((d) => (
              <path
                key={d}
                d={d}
                fill="none"
                pathLength={1}
                data-draw
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {first && first.value !== null && hover === null ? (
            <>
              <span
                {...stylex.props(styles.dot)}
                style={{ left: `${x(firstIndex)}%`, top: `${y(first.value)}%` }}
              />
              <span
                {...stylex.props(styles.dotLabel, styles.labelStart)}
                style={{ left: `${x(firstIndex)}%`, top: `${y(first.value)}%` }}
              >
                {formatValue(first.value)}
              </span>
            </>
          ) : null}
          {last && last.value !== null && lastIndex !== firstIndex && hover === null ? (
            <>
              <span
                {...stylex.props(styles.dot)}
                style={{ left: `${x(lastIndex)}%`, top: `${y(last.value)}%` }}
              />
              <span
                {...stylex.props(styles.dotLabel, styles.labelEnd)}
                style={{ left: `${x(lastIndex)}%`, top: `${y(last.value)}%` }}
              >
                {formatValue(last.value)}
              </span>
            </>
          ) : null}

          {peak && peak.value !== null && hover === null ? (
            <>
              <span
                {...stylex.props(styles.dot)}
                style={{ left: `${x(peakIndex)}%`, top: `${y(peak.value)}%` }}
              />
              <span
                {...stylex.props(styles.dotLabel, styles.labelPeak)}
                style={{ left: `${x(peakIndex)}%`, top: `${y(peak.value)}%` }}
              >
                {formatValue(peak.value)}
              </span>
            </>
          ) : null}

          {hovered && hover !== null ? (
            <>
              <span {...stylex.props(styles.crosshair)} style={{ left: `${x(hover)}%` }} />
              {hovered.value !== null ? (
                <span
                  {...stylex.props(styles.dot)}
                  style={{ left: `${x(hover)}%`, top: `${y(hovered.value)}%` }}
                />
              ) : null}
              <span
                {...stylex.props(styles.tooltip)}
                style={{
                  left: `${x(hover)}%`,
                  top: `${y(hovered.value ?? (lo + hi) / 2)}%`,
                }}
              >
                <span {...stylex.props(styles.tooltipDate)}>{formatLabel(hovered.label)}</span>
                <span {...stylex.props(styles.tooltipValue)}>
                  {valueName} {hovered.value === null ? '—' : formatValue(hovered.value)}
                </span>
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div aria-hidden {...stylex.props(styles.frame)}>
        <span {...stylex.props(styles.yAxis, styles.tickSizer)}>{formatValue(max)}</span>
        <div {...stylex.props(styles.xAxis)}>
          {data.map((d, i) =>
            (n - 1 - i) % labelEvery === 0 ? (
              <span
                key={d.label}
                {...stylex.props(
                  styles.xLabel,
                  i === 0 && styles.xLabelFirst,
                  i === n - 1 && styles.xLabelLast,
                )}
                style={{ left: `${x(i)}%` }}
              >
                {formatLabel(d.label)}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
