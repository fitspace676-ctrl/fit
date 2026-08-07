'use client';

// The Staff tab.
//
// Laid out on the Overview's own work-area grid — a main column carrying the
// trends and a rail that sticks on wide screens carrying the standing figures —
// so the tabs read as one dashboard rather than several designs. Follows
// `member-retention/members-view.tsx`, the reference implementation for a
// hand-built tab: same layout, same cache/retry/motion treatment, same
// error-as-banner split.
//
// The tab has TWO HALVES the schema cannot join: trainers carry the availability
// utilization divides by, staff accounts carry the rota. Nothing here totals
// across them, and the cards say which half they belong to.
//
// The granularity is owned HERE, not by the card that displays it: it scopes every
// trend on the tab, and one round trip recomputes all of them. A per-card fetch
// could leave the KPI strip describing one window while the chart beneath it
// described another.
//
// Fetch/cache/retry follows `segments/segment-panel.tsx`: responses are cached by
// the granularity for as long as this component stays MOUNTED,
// so flipping back to a visited combination is instant; a failure is an alert
// scoped to the tab, and Retry drops only its own cache entry.
//
// Note the mount, not the page: the shell renders this tab conditionally, so
// leaving Staff for another tab unmounts it and the cache goes with it.
//
// Motion: changing the control settles the tab as a short diagonal cascade
// rather than a single hard swap. It matters most on a CACHED combination, where
// the response is already in hand and the numbers would otherwise simply jump.
//
// Unlike a keyframe replayed by remounting, this is a TRANSITION replayed from
// state. The cards own their own segmented controls, and remounting them would
// drop keyboard focus from the very button the user just pressed. Instead
// `settled` flips false on a data change and true on the next frame, so the cards
// transition up from their offset without anything unmounting. Only `opacity` and
// `transform` animate — both compositor properties. Under
// `prefers-reduced-motion` the rise and the stagger drop away, leaving a plain
// fade: the motion is decoration and never gates the content.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import {
  DEFAULT_STAFF_GRANULARITY,
  type DashboardStaffResponse,
  type StaffGranularity,
} from '@fit/types';
import { loadStaffAction } from './actions';
import { StaffKpiStrip } from './staff-kpi-strip';
import { SessionsTrendCard } from './sessions-trend-card';
import { TrainerUtilizationCard } from './trainer-utilization-card';
import { ShiftCoverageCard } from './shift-coverage-card';
import { SessionsPerTrainerCard } from './sessions-per-trainer-card';
import { StaffGapsCard } from './staff-gaps-card';

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  workArea: {
    display: 'grid',
    gap: '1.5rem',
    alignItems: 'start',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': 'minmax(0, 2.2fr) minmax(280px, 1fr)',
    },
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    // `minWidth: 0` stops a wide chart from forcing the grid track wider than its
    // share — the standard grid-blowout guard.
    minWidth: 0,
  },
  rail: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    minWidth: 0,
    position: {
      default: 'static',
      '@media (min-width: 1280px)': 'sticky',
    },
    // Clears the console's fixed chrome, then a little breathing room.
    top: '5rem',
    maxHeight: {
      default: 'none',
      '@media (min-width: 1280px)': 'calc(100dvh - 6rem)',
    },
    overflowY: {
      default: 'visible',
      '@media (min-width: 1280px)': 'auto',
    },
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
    height: '24rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-background-muted)',
  },
  // The same message as `status`, but as a strip above content that is still on
  // screen — the previous combination's figures, which stay usable.
  banner: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  pending: {
    opacity: 0.7,
    transitionProperty: 'opacity',
    transitionDuration: '150ms',
    transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
  },
});

/** Per-step delay of the settle cascade, in the order the eye reads the tab. */
const STAGGER_MS = 45;

const motion = stylex.create({
  // The resting state each card animates FROM. No transition here, so a data
  // change snaps back to the offset in one frame rather than easing backwards.
  offset: {
    opacity: 0,
    transform: {
      default: 'translateY(6px)',
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
  },
  settled: (step: number) => ({
    opacity: 1,
    transform: 'translateY(0)',
    transitionProperty: 'opacity, transform',
    transitionDuration: '0.26s',
    transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
    transitionDelay: {
      default: `${step * STAGGER_MS}ms`,
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
  }),
});

export function StaffView() {
  const t = useTranslations('admin.dashboard.staff');

  const [granularity, setGranularity] = useState<StaffGranularity>(DEFAULT_STAFF_GRANULARITY);

  const cache = useRef(new Map<string, DashboardStaffResponse>());
  const [data, setData] = useState<DashboardStaffResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const key = granularity;

  useEffect(() => {
    const cached = cache.current.get(key);
    if (cached) {
      setData(cached);
      setError(null);
      setPending(false);
      return;
    }

    let cancelled = false;
    setError(null);
    setPending(true);
    void loadStaffAction({ granularity })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          cache.current.set(key, result.data);
          setData(result.data);
        } else {
          setError(result.error);
        }
        setPending(false);
      })
      // `loadStaffAction` resolves its OWN failures into `{ ok: false }`, so this
      // only catches the call itself failing — a dropped connection to the Server
      // Action endpoint. Without it that rejection goes unhandled AND leaves
      // `pending` stuck true with `data` null: a permanent skeleton with no retry.
      .catch(() => {
        if (cancelled) return;
        setError(t('loadError'));
        setPending(false);
      });
    return () => {
      cancelled = true;
    };
    // `attempt` is in the deps purely to force a re-run on retry; the cache bypass
    // itself comes from `retry` deleting this key first.
  }, [key, granularity, attempt, t]);

  // What is CURRENTLY on screen, which is not always what the controls say: a
  // fetch in flight leaves the previous response rendered (dimmed) until the new
  // one lands. Keying the cascade on this rather than on `data`'s identity is
  // what makes a cached combination animate too — the cache hands back the same
  // object it handed back last time, so an identity check would see no change.
  const shownKey = data === null ? '' : data.granularity;

  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    // One frame at the offset, then release. Without the frame the browser
    // coalesces both values into a single style computation and nothing moves.
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, [shownKey]);

  /**
   * Retry the combination currently on screen. Deleting its own cache entry
   * scopes the bypass to THIS combination — every other cached response stays.
   */
  const retry = useCallback(() => {
    cache.current.delete(key);
    setAttempt((n) => n + 1);
  }, [key]);

  // A first load that fails has nothing to show around the alert, so the alert IS
  // the tab. Once there is data on screen the alert becomes a banner instead: the
  // granularity control lives inside a card, so replacing the whole tab would take
  // away the only affordance that could get the user back to a window that works,
  // stranding them on the one that just failed with nothing but a Retry for it.
  if (error !== null && data === null) {
    return (
      <div role="alert" {...stylex.props(styles.status)}>
        <span>{error}</span>
        <Button variant="secondary" size="sm" label={t('retry')} onClick={retry} />
      </div>
    );
  }

  if (data === null) {
    return <div {...stylex.props(styles.skeleton)} aria-hidden="true" />;
  }

  /**
   * The cascade step for one card. `step` is its place in the diagonal sweep the
   * eye takes across the tab — strip, then the main column and the rail settling
   * together row by row — not its index in any one list.
   */
  const step = (n: number) => (settled ? motion.settled(n) : motion.offset);

  return (
    <div {...stylex.props(styles.page, pending && styles.pending)}>
      {error !== null ? (
        <div role="alert" {...stylex.props(styles.banner)}>
          <span>{error}</span>
          <Button variant="secondary" size="sm" label={t('retry')} onClick={retry} />
        </div>
      ) : null}

      <div {...stylex.props(step(0))}>
        <StaffKpiStrip data={data} granularity={data.granularity} />
      </div>

      <div {...stylex.props(styles.workArea)}>
        <div {...stylex.props(styles.column)}>
          <div {...stylex.props(step(1))}>
            <SessionsTrendCard
              points={data.sessionsOverTime}
              granularity={granularity}
              onSelectGranularity={setGranularity}
              disabled={pending}
            />
          </div>
          <div {...stylex.props(step(2))}>
            <TrainerUtilizationCard trainers={data.trainers} />
          </div>
          {/*
            The rota sits on the LEFT with the trends despite being a snapshot: it
            is the staff half of the tab, and burying it in a narrow rail would
            read as an afterthought rather than as the second of two halves.
          */}
          <div {...stylex.props(step(3))}>
            <ShiftCoverageCard days={data.shiftCoverage} />
          </div>
        </div>

        <div {...stylex.props(styles.rail)}>
          <div {...stylex.props(step(2))}>
            <SessionsPerTrainerCard trainers={data.trainers} />
          </div>
          <div {...stylex.props(step(3))}>
            <StaffGapsCard gaps={data.gaps} />
          </div>
        </div>
      </div>
    </div>
  );
}
