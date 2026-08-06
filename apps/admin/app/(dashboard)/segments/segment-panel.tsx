'use client';

// One segment's panel: fetch, cache, and the staged swap between segments.
//
// Each segment is fetched on FIRST activation and cached by `segment:range`, so
// returning to a visited segment is instant — which is what lets the switch
// animate rather than sit on a spinner. Changing the range invalidates by virtue
// of the composite key.
//
// The swap is staged like the console's drawers: the outgoing grid fades out
// while still mounted, and only then does the incoming one mount and cascade in.
// The panel holds its previous height across the swap so the page doesn't jump
// while the new grid measures.

import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import type {
  ConfigurableDashboardSegment,
  DashboardRange,
  DashboardSegmentResponse,
} from '@fit/types';
import { loadSegmentAction } from './actions';
import { WidgetGrid } from './widget-grid';

/** Exit duration — must stay in step with `swap.exiting`'s `transitionDuration`. */
const EXIT_MS = 120;

const styles = stylex.create({
  panel: {
    transitionProperty: 'opacity, transform',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 1, 1)',
  },
  entering: {
    opacity: 1,
    transform: 'translateY(0)',
    transitionDuration: '0s',
  },
  exiting: {
    opacity: 0,
    transform: {
      default: 'translateY(-4px)',
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
    transitionDuration: `${EXIT_MS}ms`,
  },
  status: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    paddingBlock: '3rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  skeleton: {
    height: '18rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-surface-muted)',
  },
});

export function SegmentPanel({
  segment,
  range,
}: {
  segment: ConfigurableDashboardSegment;
  range: DashboardRange;
}) {
  const t = useTranslations('admin.dashboard.segments');
  const locale = useLocale();

  // Cached responses survive re-renders and segment switches for the page's life.
  const cache = useRef(new Map<string, DashboardSegmentResponse>());
  const [shown, setShown] = useState<ConfigurableDashboardSegment>(segment);
  const [exiting, setExiting] = useState(false);
  const [data, setData] = useState<DashboardSegmentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [minHeight, setMinHeight] = useState<number | undefined>();
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Stage the swap: fade the current grid out, hold the height, then switch.
  useEffect(() => {
    if (segment === shown) return;
    setMinHeight(bodyRef.current?.offsetHeight);
    setExiting(true);
    const timer = setTimeout(() => {
      setShown(segment);
      setExiting(false);
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [segment, shown]);

  // Load the shown segment, from cache when we already have it.
  useEffect(() => {
    const key = `${shown}:${range}`;
    const cached = cache.current.get(key);
    if (cached && attempt === 0) {
      setData(cached);
      setError(null);
      setMinHeight(undefined);
      return;
    }

    let cancelled = false;
    setData(null);
    setError(null);
    void loadSegmentAction(shown, range).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        cache.current.set(key, result.data);
        setData(result.data);
      } else {
        setError(result.error);
      }
      setMinHeight(undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [shown, range, attempt]);

  return (
    <div
      ref={bodyRef}
      style={minHeight ? { minHeight } : undefined}
      {...stylex.props(styles.panel, exiting ? styles.exiting : styles.entering)}
    >
      {error !== null ? (
        <div role="alert" {...stylex.props(styles.status)}>
          <span>{t('loadError')}</span>
          <Button
            variant="secondary"
            size="sm"
            label={t('retry')}
            onClick={() => setAttempt((n) => n + 1)}
          />
        </div>
      ) : data === null ? (
        <div {...stylex.props(styles.skeleton)} aria-hidden="true" />
      ) : (
        <WidgetGrid widgets={data.widgets} currency={data.currency} locale={locale} />
      )}
    </div>
  );
}
