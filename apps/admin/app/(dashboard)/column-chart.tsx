'use client';

// Columns over time, for money that is a quantity per bucket (a day's takings).
//
// Why columns and not the smoothed area the trend cards used: a curve drawn
// between two days invents revenue on the days around a spike, and a 30-day
// curve with no axis could not be read for a single figure at all. Here every
// bucket is its own bar, the y-axis carries three gridlines with their values,
// the mean is a dashed reference, the best bucket is labelled, and hovering any
// column names its date and figure.
//
// An optional `negative` series (refunds) hangs BELOW the baseline on the same
// scale, so money going out reads as the opposite of money coming in rather than
// as a second line tangled with the first.

import { useState, type CSSProperties } from 'react';
import * as stylex from '@stylexjs/stylex';
import { SingleBucket, type SingleBucketPart } from './single-bucket';

export interface ColumnDatum {
  /** The bucket key, e.g. `2026-11-26`. */
  label: string;
  /** `null` is a bucket with nothing to measure: no bar, and not a zero. */
  value: number | null;
  /** Drawn downward from the baseline, e.g. refunds. Omit for a one-sided chart. */
  negative?: number;
  /** A second positive part stacked on `value`, so the column is their sum. */
  stack?: number;
}

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

const styles = stylex.create({
  // Headroom for the peak's label above the tallest column.
  wrap: {
    paddingTop: '1.25rem',
  },
  frame: {
    position: 'relative',
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
  // Holds the widest tick label in flow, so the axis column gets its width.
  tickSizer: {
    visibility: 'hidden',
    whiteSpace: 'nowrap',
  },
  plot: {
    position: 'relative',
  },
  grid: {
    position: 'absolute',
    insetInline: 0,
    height: 0,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--chart-guide)',
  },
  baseline: {
    borderTopColor: 'var(--color-border-emphasized)',
  },
  mean: {
    borderTopStyle: 'dashed',
    borderTopColor: 'var(--color-text-secondary)',
    opacity: 0.6,
  },
  meanLabel: {
    position: 'absolute',
    insetInlineEnd: 0,
    transform: 'translateY(-115%)',
    paddingInline: '0.375rem',
    paddingBlock: '0.0625rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    whiteSpace: 'nowrap',
    color: 'var(--color-text-secondary)',
  },
  columns: {
    position: 'absolute',
    insetBlock: 0,
    insetInline: 0,
    display: 'flex',
  },
  column: {
    position: 'relative',
    flex: 1,
    minWidth: 0,
    cursor: 'default',
  },
  // Each half of a column is positioned against the baseline, so a bar grows
  // away from zero in its own direction.
  up: {
    position: 'absolute',
    insetInline: '18%',
    borderTopLeftRadius: '4px',
    borderTopRightRadius: '4px',
    backgroundColor: 'var(--chart-series-1)',
    transitionProperty: 'opacity',
    transitionDuration: '150ms',
    transitionTimingFunction: EASE_OUT,
  },
  down: {
    position: 'absolute',
    insetInline: '18%',
    borderBottomLeftRadius: '4px',
    borderBottomRightRadius: '4px',
    backgroundColor: 'var(--color-error)',
    transitionProperty: 'opacity',
    transitionDuration: '150ms',
    transitionTimingFunction: EASE_OUT,
  },
  // While one column is hovered the rest step back, so the read is one bucket.
  dimmed: {
    opacity: 0.35,
  },
  peakLabel: {
    position: 'absolute',
    left: '50%',
    transform: 'translate(-50%, -125%)',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    color: 'var(--color-text-primary)',
    pointerEvents: 'none',
  },
  tooltip: {
    position: 'absolute',
    top: 0,
    zIndex: 1,
    transform: 'translate(-50%, -100%)',
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
  tooltipDate: {
    color: 'var(--color-text-secondary)',
  },
  tooltipRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontFamily: 'var(--font-family-code)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  swatch: {
    width: '0.5rem',
    height: '0.5rem',
    borderRadius: '2px',
  },
  swatchUp: { backgroundColor: 'var(--chart-series-1)' },
  swatchStack: { backgroundColor: 'var(--chart-series-2)' },
  // The stacked part: its own hue, carrying the column's rounded end.
  stacked: {
    position: 'absolute',
    insetInline: '18%',
    borderTopLeftRadius: '4px',
    borderTopRightRadius: '4px',
    backgroundColor: 'var(--chart-series-2)',
    transitionProperty: 'opacity',
    transitionDuration: '150ms',
    transitionTimingFunction: EASE_OUT,
  },
  flatTop: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  tooltipTotal: {
    marginTop: '0.125rem',
    paddingTop: '0.25rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
  swatchDown: { backgroundColor: 'var(--color-error)' },
  xAxis: {
    display: 'flex',
    marginTop: '0.5rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
  // Flex, not text-align: a label wider than its column overflows evenly around
  // its centre, and the end labels lean inward instead of spilling off the plot.
  xLabel: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    overflow: 'visible',
  },
  xLabelFirst: { justifyContent: 'flex-start' },
  xLabelLast: { justifyContent: 'flex-end' },
});

/** The smallest 1/2/2.5/5 × 10ⁿ at or above `value`, so ticks land on round figures. */
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= value) ?? 10;
  return step * power;
}

export function ColumnChart({
  data,
  formatValue,
  formatLabel,
  ariaLabel,
  valueName,
  negativeName,
  stackName,
  totalName,
  meanLabel,
  maxValue,
  integer,
  noDataLabel = '—',
  height = 220,
}: {
  data: ColumnDatum[];
  /** Renders a figure for the axis, the labels and the tooltip. */
  formatValue: (value: number) => string;
  /** Turns a bucket key into the date the reader expects. */
  formatLabel: (label: string) => string;
  ariaLabel: string;
  /** Series names, shown in the tooltip beside their figure. */
  valueName: string;
  negativeName?: string;
  /** Name of the stacked part, and of the column's sum, for the tooltip. */
  stackName?: string;
  totalName?: string;
  /** When set, a dashed line at the mean of `value`, labelled with this and the figure. */
  meanLabel?: string;
  /** Pins the top of the axis, e.g. 100 for a percentage. */
  maxValue?: number;
  /** Counts: keeps the half-way tick on a whole number. */
  integer?: boolean;
  /** What the tooltip says for a `null` bucket. */
  noDataLabel?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;

  // One bucket compares nothing: say the figure instead of drawing it.
  const only = n === 1 ? data[0] : undefined;
  if (only) {
    const parts: SingleBucketPart[] = [];
    if (stackName || negativeName) {
      parts.push({
        name: valueName,
        amount: only.value ?? 0,
        display: only.value === null ? noDataLabel : formatValue(only.value),
        swatch: 'up',
      });
    }
    if (stackName) {
      parts.push({
        name: stackName,
        amount: only.stack ?? 0,
        display: formatValue(only.stack ?? 0),
        swatch: 'stack',
      });
    }
    if (negativeName) {
      parts.push({
        name: negativeName,
        amount: only.negative ?? 0,
        display: formatValue(only.negative ?? 0),
        swatch: 'down',
      });
    }
    return (
      <SingleBucket
        value={only.value === null ? noDataLabel : formatValue(only.value + (only.stack ?? 0))}
        // A rate (an axis pinned at 100) is read against its whole scale.
        percent={maxValue === 100 && only.value !== null ? only.value : undefined}
        parts={parts}
      />
    );
  }

  // A column's height is its full positive total: the value plus any stacked part.
  const values = data.map((d) => (d.value ?? 0) + (d.stack ?? 0));
  const rawUp = niceCeil(Math.max(0, ...values));
  const upMax = maxValue ?? (integer ? Math.max(2, Math.ceil(rawUp / 2) * 2) : rawUp);
  const rawDown = Math.max(0, ...data.map((d) => d.negative ?? 0));
  // At least a fifth of the up range below zero, so the baseline's tick and the
  // negative tick never collide. Still one scale: only the headroom grows.
  const downMax =
    rawDown <= 0
      ? 0
      : integer
        ? Math.max(Math.ceil(rawDown), Math.ceil(upMax * 0.15))
        : Math.max(niceCeil(rawDown), niceCeil(upMax * 0.15));
  // One scale for both directions: the baseline sits where the two ranges meet.
  const span = upMax + downMax;
  const baseFromTop = (upMax / span) * 100;
  const y = (value: number) => baseFromTop - (value / span) * 100;

  const ticks = [upMax, upMax / 2, 0, ...(downMax > 0 ? [-downMax] : [])];
  const measured = data.filter((d) => d.value !== null);
  const mean =
    meanLabel && measured.length > 2
      ? measured.reduce((sum, d) => sum + (d.value ?? 0), 0) / measured.length
      : null;

  const peakIndex = values.reduce((best, v, i) => (v > (values[best] ?? -Infinity) ? i : best), 0);
  // Thin the axis to about eight dates, counted back from the latest so it always shows.
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const hovered = hover === null ? null : data[hover];
  // Columns grow left to right as one wave: ~300ms across the whole chart however
  // many there are, so a 90-day chart is no slower to arrive than a 7-day one.
  const growDelay = (i: number) => `${160 + Math.round((i / Math.max(1, n - 1)) * 300)}ms`;

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.frame)}>
        <div aria-hidden {...stylex.props(styles.yAxis)} style={{ height }}>
          <span {...stylex.props(styles.tickSizer)}>{formatValue(upMax)}</span>
          {ticks.map((tick) => (
            <span key={tick} {...stylex.props(styles.tick)} style={{ top: `${y(tick)}%` }}>
              {tick < 0 ? `−${formatValue(-tick)}` : formatValue(tick)}
            </span>
          ))}
        </div>

        <div
          role="img"
          aria-label={ariaLabel}
          {...stylex.props(styles.plot)}
          style={{ height }}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              aria-hidden
              {...stylex.props(styles.grid, tick === 0 && styles.baseline)}
              style={{ top: `${y(tick)}%` }}
            />
          ))}

          <div {...stylex.props(styles.columns)}>
            {data.map((d, i) => {
              const dim = hover !== null && hover !== i;
              return (
                <div
                  key={d.label}
                  {...stylex.props(styles.column)}
                  onPointerEnter={() => setHover(i)}
                >
                  {d.value !== null && d.value > 0 ? (
                    <span
                      {...stylex.props(
                        styles.up,
                        (d.stack ?? 0) > 0 && styles.flatTop,
                        dim && styles.dimmed,
                      )}
                      data-grow="up"
                      style={
                        {
                          top: `${y(d.value)}%`,
                          bottom: `${100 - baseFromTop}%`,
                          '--grow-delay': growDelay(i),
                        } as CSSProperties
                      }
                    >
                      {i === peakIndex && hover === null && n > 1 && !d.stack ? (
                        <span {...stylex.props(styles.peakLabel)}>{formatValue(d.value)}</span>
                      ) : null}
                    </span>
                  ) : null}
                  {d.stack && d.stack > 0 ? (
                    <span
                      {...stylex.props(styles.stacked, dim && styles.dimmed)}
                      data-grow="up"
                      style={
                        {
                          top: `${y((d.value ?? 0) + d.stack)}%`,
                          // A 2px surface gap between the two parts of one column.
                          bottom: `calc(${100 - y(d.value ?? 0)}% + ${d.value ? 2 : 0}px)`,
                          '--grow-delay': growDelay(i),
                        } as CSSProperties
                      }
                    >
                      {i === peakIndex && hover === null && n > 1 ? (
                        <span {...stylex.props(styles.peakLabel)}>
                          {formatValue((d.value ?? 0) + d.stack)}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  {d.negative && d.negative > 0 ? (
                    <span
                      {...stylex.props(styles.down, dim && styles.dimmed)}
                      data-grow="down"
                      style={
                        {
                          top: `${baseFromTop}%`,
                          bottom: `${100 - y(-d.negative)}%`,
                          '--grow-delay': growDelay(i),
                        } as CSSProperties
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </div>

          {mean !== null ? (
            <>
              <span
                aria-hidden
                {...stylex.props(styles.grid, styles.mean)}
                style={{ top: `${y(mean)}%` }}
              />
              <span {...stylex.props(styles.meanLabel)} style={{ top: `${y(mean)}%` }}>
                {meanLabel} {formatValue(integer ? Math.round(mean) : mean)}
              </span>
            </>
          ) : null}

          {hovered && hover !== null ? (
            <span
              {...stylex.props(styles.tooltip)}
              style={{
                left: `${((hover + 0.5) / n) * 100}%`,
                top: `${y((hovered.value ?? 0) + (hovered.stack ?? 0))}%`,
              }}
            >
              <span {...stylex.props(styles.tooltipDate)}>{formatLabel(hovered.label)}</span>
              <span {...stylex.props(styles.tooltipRow)}>
                <span {...stylex.props(styles.swatch, styles.swatchUp)} />
                {valueName} {hovered.value === null ? noDataLabel : formatValue(hovered.value)}
              </span>
              {stackName ? (
                <span {...stylex.props(styles.tooltipRow)}>
                  <span {...stylex.props(styles.swatch, styles.swatchStack)} />
                  {stackName} {formatValue(hovered.stack ?? 0)}
                </span>
              ) : null}
              {stackName && totalName ? (
                <span {...stylex.props(styles.tooltipRow, styles.tooltipTotal)}>
                  {totalName} {formatValue((hovered.value ?? 0) + (hovered.stack ?? 0))}
                </span>
              ) : null}
              {negativeName ? (
                <span {...stylex.props(styles.tooltipRow)}>
                  <span {...stylex.props(styles.swatch, styles.swatchDown)} />
                  {negativeName} {formatValue(hovered.negative ?? 0)}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>

      <div aria-hidden {...stylex.props(styles.frame)}>
        <span {...stylex.props(styles.yAxis, styles.tickSizer)}>{formatValue(upMax)}</span>
        <div {...stylex.props(styles.xAxis)}>
          {data.map((d, i) => (
            <span
              key={d.label}
              {...stylex.props(
                styles.xLabel,
                i === 0 && styles.xLabelFirst,
                i === n - 1 && styles.xLabelLast,
              )}
            >
              {(n - 1 - i) % labelEvery === 0 ? formatLabel(d.label) : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
