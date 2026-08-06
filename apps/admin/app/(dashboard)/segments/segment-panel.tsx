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
  //
  // If `segment` returns to whatever `shown` still is — the tab was double-
  // clicked, or clicked twice within EXIT_MS — there is no swap to perform.
  // Resetting `exiting`/`minHeight` here (rather than leaving them as the
  // in-flight exit left them) is what stops the panel getting stuck faded out:
  // without it, the timeout that would have cleared them never runs, because
  // the cleanup below cancels it the moment `segment` changes back.
  useEffect(() => {
    if (segment === shown) {
      setExiting(false);
      setMinHeight(undefined);
      return;
    }
    setMinHeight(bodyRef.current?.offsetHeight);
    setExiting(true);
    const timer = setTimeout(() => {
      setShown(segment);
      setExiting(false);
    }, EXIT_MS);
    // Runs on the next segment change AND on unmount — either way, a pending
    // swap must not fire setState against a panel that has moved on.
    return () => clearTimeout(timer);
  }, [segment, shown]);

  // Load the shown segment, from cache when we already have it.
  //
  // The cache check is keyed only on `key` — NOT on `attempt` — so a retry
  // fired for one segment can never defeat the cache for any other segment.
  // `attempt` still forces this effect to re-run (its deps are otherwise
  // unchanged on a same-segment retry); what makes the retry actually bypass
  // the cache is the Retry button deleting this segment's own entry before
  // bumping `attempt`, below.
  useEffect(() => {
    const key = `${shown}:${range}`;
    const cached = cache.current.get(key);
    if (cached) {
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

  /**
   * Retry the segment currently on screen. Deleting its own cache entry (a
   * failed load was never cached in the first place, but a stale success
   * might be what's being retried) scopes the bypass to THIS segment only —
   * every other segment's cache entry, and this one once it next succeeds,
   * stays intact.
   */
  function retry() {
    cache.current.delete(`${shown}:${range}`);
    setAttempt((n) => n + 1);
  }

  return (
    <div
      ref={bodyRef}
      // Not styling — plain attributes the StyleX-shimmed test suite (which
      // cannot see the `exiting`/`entering` classes) can assert the swap phase
      // through directly, since production CSS reads `exiting`/`entering` off
      // that same state, not off this attribute.
      data-testid="segment-panel"
      data-phase={exiting ? 'exiting' : 'entering'}
      style={minHeight ? { minHeight } : undefined}
      {...stylex.props(styles.panel, exiting ? styles.exiting : styles.entering)}
    >
      {error !== null ? (
        <div role="alert" {...stylex.props(styles.status)}>
          <span>{t('loadError')}</span>
          <Button variant="secondary" size="sm" label={t('retry')} onClick={retry} />
        </div>
      ) : data === null ? (
        <div {...stylex.props(styles.skeleton)} aria-hidden="true" />
      ) : (
        <WidgetGrid widgets={data.widgets} currency={data.currency} locale={locale} />
      )}
    </div>
  );
}
