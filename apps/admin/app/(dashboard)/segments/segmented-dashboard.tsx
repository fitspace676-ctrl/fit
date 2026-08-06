'use client';

// The dashboard shell: the tab bar, the picker, and whichever segment is active.
//
// The active segment lives in the URL (`?segment=`) beside the existing `?range=`
// and `?period=`, so a shared or bookmarked link opens on the right tab. Like
// those two it is written with `router.replace`, so switching tabs does not
// stack history entries — and the back button leaves the dashboard rather than
// stepping back through segments. `overview` renders the server-fetched control
// room unchanged; every other tab hands off to the lazily-fetched panel.

import { useCallback, useState, useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  DEFAULT_DASHBOARD_SEGMENT,
  dashboardSegmentSchema,
  type ConfigurableDashboardSegment,
  type DashboardOverviewResponse,
  type DashboardRange,
  type DashboardSegment,
} from '@fit/types';
import { DashboardHeader } from '../dashboard-header';
import { OverviewView } from '../overview/overview-view';
import { AddWidgetDialog } from './add-widget-dialog';
import { SegmentPanel } from './segment-panel';
import { SegmentTabs } from './segment-tabs';

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  bar: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  // Belt-and-braces beside the `hidden` attribute: the console's resets style
  // plenty of elements by tag, and a stray `display` there would out-specify the
  // UA sheet's `[hidden] { display: none }`.
  hidden: { display: 'none' },
});

export function SegmentedDashboard({
  overview,
  initialSegment,
  selectedKeys,
  range,
}: {
  overview: DashboardOverviewResponse;
  initialSegment: DashboardSegment;
  selectedKeys: Record<ConfigurableDashboardSegment, string[]>;
  range: DashboardRange;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Parsed, not cast: `?segment=` is user-editable, and an unrecognised value
  // must land on the default rather than reach `SegmentPanel` as a segment the
  // API has never heard of. The server parses it the same way for the first
  // paint; this covers every client-side navigation after it.
  const parsed = dashboardSegmentSchema.safeParse(searchParams.get('segment'));
  const active: DashboardSegment = parsed.success ? parsed.data : initialSegment;

  // The last configurable segment the user opened. The panel stays MOUNTED at
  // this segment while Overview is on screen, so its fetch cache (a ref, and so
  // only as long-lived as the mount) survives a trip through Overview and the
  // return trip is instant. `null` until a segment is opened, so a dashboard
  // that is never taken off Overview costs no segment request at all.
  const [lastSegment, setLastSegment] = useState<ConfigurableDashboardSegment | null>(
    initialSegment === 'overview' ? null : initialSegment,
  );
  if (active !== 'overview' && active !== lastSegment) {
    // Render-phase set on the CURRENT component (React re-renders immediately,
    // before committing) — the alternative is an effect, which would paint one
    // frame of the old segment first.
    setLastSegment(active);
  }

  // Bumped when the picker saves. It re-keys the panel, and remounting is what
  // drops the cached responses — a saved selection must not keep serving the
  // widget set it replaced.
  const [savedAt, setSavedAt] = useState(0);

  // What each segment is CURRENTLY showing, for the picker's checkboxes. It
  // starts as the catalogue default (all the server can know without fetching
  // every segment) and is corrected, per segment, by the panel's own fetch.
  const [selections, setSelections] = useState(selectedKeys);

  const noteSelection = useCallback(
    (segment: ConfigurableDashboardSegment, widgetKeys: string[]) => {
      setSelections((current) =>
        (current[segment] ?? []).join(' ') === widgetKeys.join(' ')
          ? current
          : { ...current, [segment]: widgetKeys },
      );
    },
    [],
  );

  function select(next: DashboardSegment): void {
    const params = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_DASHBOARD_SEGMENT) {
      params.delete('segment');
    } else {
      params.set('segment', next);
    }
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
  }

  function onSaved(): void {
    setSavedAt((n) => n + 1);
    router.refresh();
  }

  return (
    <div {...stylex.props(styles.page)}>
      <DashboardHeader active={active} period={overview.period} range={range} />

      <div {...stylex.props(styles.bar)}>
        <SegmentTabs active={active} onSelect={select} />
        {active !== 'overview' ? (
          <AddWidgetDialog initialSegment={active} selectedKeys={selections} onSaved={onSaved} />
        ) : null}
      </div>

      {/*
        One panel, not two. Both the overview and the lazily-fetched segment live
        inside it, and `aria-labelledby` follows whichever tab is active — which is
        what completes the tablist/tabpanel pair the tab bar has always claimed.

        No `tabIndex={0}` here: the APG asks for it only when a panel has no
        focusable descendants, and these are full of buttons, links and charts. A
        tab stop on the container would just be one more thing to tab past.
      */}
      <div id="dashboard-tabpanel" role="tabpanel" aria-labelledby={`dashboard-tab-${active}`}>
        {active === 'overview' ? <OverviewView data={overview} /> : null}

        {lastSegment !== null ? (
          <div
            key={savedAt}
            hidden={active === 'overview'}
            {...stylex.props(active === 'overview' && styles.hidden)}
          >
            <SegmentPanel segment={lastSegment} range={range} onLoaded={noteSelection} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
