'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/*  CountUp                                                                     */
/* -------------------------------------------------------------------------- */

/** Tween a number from 0 → `to` on mount with a cubic ease-out. */
export function CountUp({
  to,
  dur = 1000,
  className = '',
  suffix = '',
}: {
  to: number;
  dur?: number;
  className?: string;
  suffix?: string;
}) {
  const [value, setValue] = useState(0);
  const ref = useRef<number | undefined>(undefined);

  useEffect(() => {
    let start: number | null = null;
    const tick = (ts: number): void => {
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start) / dur);
      const eased = 1 - (1 - p) ** 3;
      setValue(Math.round(to * eased));
      if (p < 1) {
        ref.current = requestAnimationFrame(tick);
      }
    };
    ref.current = requestAnimationFrame(tick);
    return () => {
      if (ref.current) cancelAnimationFrame(ref.current);
    };
  }, [to, dur]);

  return (
    <span className={className}>
      {value}
      {suffix}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Occupancy                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A "value / cap" header over an animated fill bar, colour-coded by how full it
 * is (green → amber → red). Used for class spots and live gym occupancy.
 */
export function Occupancy({
  value,
  cap,
  className = '',
}: {
  value: number;
  cap: number;
  className?: string;
}) {
  const pct = cap > 0 ? Math.round((value / cap) * 100) : 0;
  const tone = pct > 85 ? 'bg-danger-500' : pct > 60 ? 'bg-warning-500' : 'bg-success-500';
  return (
    <div className={className}>
      <div className="mb-2 flex items-end justify-between">
        <p className="font-mono text-2xl font-bold tabular-nums text-ink-900 dark:text-white">
          {value}
          <span className="text-base text-ink-400 dark:text-ink-500">/{cap}</span>
        </p>
        <span className="font-mono text-xs text-ink-400">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-pill bg-ink-100 dark:bg-white/10">
        <div
          className={`h-full rounded-pill transition-[width] duration-700 ease-out ${tone}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Donut                                                                       */
/* -------------------------------------------------------------------------- */

/** A circular progress ring with a center slot, animated on mount/value change. */
export function Donut({
  pct,
  size = 64,
  stroke = 7,
  color = 'text-brand-500 dark:text-brand-400',
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
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
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="text-ink-100 dark:text-white/10"
          stroke="currentColor"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={`${color} transition-[stroke-dasharray] duration-[900ms] ease-out`}
          stroke="currentColor"
          strokeDasharray={`${(draw / 100) * circ} ${circ}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  AreaChart                                                                   */
/* -------------------------------------------------------------------------- */

/** One plotted point of an {@link AreaChart}: an x-axis label and its value. */
export interface AreaPoint {
  label: string;
  value: number;
}

/**
 * A compact, dependency-free area/line chart on the Aurora palette. Renders a
 * gradient-filled area under a brand stroke, scaled to the data's own max, inside a
 * responsive `viewBox` so it fills its container. An all-zero (or empty) series
 * draws a flat baseline, so the caller can still show the frame with an empty-state
 * caption rather than a broken chart.
 */
export function AreaChart({
  data,
  height = 180,
  className = '',
  ariaLabel = 'Area chart',
}: {
  data: AreaPoint[];
  height?: number;
  className?: string;
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
  const gradientId = `area-fill-${n}-${Math.round(max)}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      className={`w-full ${className}`}
      style={{ height }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            className="text-brand-500"
            stopColor="currentColor"
            stopOpacity={0.35}
          />
          <stop offset="100%" className="text-brand-500" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#${gradientId})`} stroke="none" />}
      {line && (
        <path
          d={line}
          fill="none"
          className="text-brand-500 dark:text-brand-400"
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
/*  Switch                                                                      */
/* -------------------------------------------------------------------------- */

/** A controlled toggle switch with the brand gradient on its on-state. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-pill transition-colors ${
        checked
          ? 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)] shadow-[0_4px_14px_-4px_rgba(98,87,227,0.8)]'
          : 'bg-ink-200 dark:bg-white/15'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}
