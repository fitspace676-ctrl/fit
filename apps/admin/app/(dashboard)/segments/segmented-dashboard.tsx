'use client';

// The dashboard shell: the tab bar, and whichever tab is active.
//
// The active tab lives in the URL (`?segment=`) beside the existing `?period=`
// and `?range=`, so a shared or bookmarked link opens on the right one. Like
// those two it is written with `router.replace`, so switching tabs does not stack
// history entries — and the back button leaves the dashboard rather than stepping
// back through tabs.
//
// Every tab is a hand-built view now. This file used to carry a second mode: a
// configurable widget grid, kept mounted behind the hand-built tabs so its fetch
// cache survived a round trip, plus the picker that edited it and the selection
// state both needed. All of that went with the catalogue — see
// `@fit/types`'s `dashboard-segments.ts` for why — leaving the shell as the switch
// it always wanted to be.

import { useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  DEFAULT_DASHBOARD_SEGMENT,
  dashboardSegmentSchema,
  type DashboardOverviewResponse,
  type DashboardSegment,
} from '@fit/types';
import { DashboardHeader } from '../dashboard-header';
import { OverviewView } from '../overview/overview-view';
import { SalesView } from '../sales/sales-view';
import { MembersView } from '../member-retention/members-view';
import { RevenueView } from '../revenue-insights/revenue-view';
import { ClassesView } from '../class-insights/classes-view';
import { StaffView } from '../staff-insights/staff-view';
import { SegmentTabs } from './segment-tabs';
import { BranchScopeNote, type BranchScope } from './branch-scope-note';

/**
 * Which tabs still show something gym-wide while a branch is selected, and the
 * wording each one carries. Kept here rather than inside the six views because
 * the note has to sit ABOVE the tab's content — a reader must meet the caveat
 * before the figures it qualifies, not after scrolling past them — and because
 * every view spends its first render on a skeleton or an error, neither of which
 * would carry it.
 *
 * `sales` is absent deliberately: every figure on that tab narrows to the
 * branch, and a caveat there would teach the reader to distrust a correct
 * number. Anything mapped to `undefined` here is a claim that the tab filters
 * completely.
 */
// This map has shrunk twice, each time because a caveat became a false statement
// rather than merely a stale one. Stage 2 retired Members and Revenue by giving
// `GymMember` a home branch, which every member figure — and, through the member
// who holds it, every subscription and invoice figure — now narrows by. Stage 3
// retired Overview by making `CheckIn.locationId` a real column something
// actually writes, which left nothing on that tab gym-wide at all.
const BRANCH_SCOPE: Partial<Record<DashboardSegment, BranchScope>> = {
  classes: 'classes',
  staff: 'staff',
};

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  panel: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  bar: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '1rem',
  },
});

export function SegmentedDashboard({
  overview,
  initialSegment,
}: {
  overview: DashboardOverviewResponse;
  initialSegment: DashboardSegment;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Parsed, not cast: `?segment=` is user-editable, and an unrecognised value must
  // land on the default rather than reach the switch below as a tab that does not
  // exist. The server parses it the same way for the first paint; this covers
  // every client-side navigation after it.
  const parsed = dashboardSegmentSchema.safeParse(searchParams.get('segment'));
  const active: DashboardSegment = parsed.success ? parsed.data : initialSegment;
  const branchScope = BRANCH_SCOPE[active];

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

  return (
    <div {...stylex.props(styles.page)}>
      <DashboardHeader active={active} period={overview.period} />

      <div {...stylex.props(styles.bar)}>
        <SegmentTabs active={active} onSelect={select} />
      </div>

      {/*
        `aria-labelledby` follows whichever tab is active — which is what completes
        the tablist/tabpanel pair the tab bar has always claimed.

        No `tabIndex={0}` here: the APG asks for it only when a panel has no
        focusable descendants, and these are full of buttons, links and charts. A
        tab stop on the container would just be one more thing to tab past.
      */}
      <div
        id="dashboard-tabpanel"
        role="tabpanel"
        aria-labelledby={`dashboard-tab-${active}`}
        {...stylex.props(styles.panel)}
      >
        {/*
          Renders itself away in "All locations" mode, which is why it can sit
          here unconditionally — see `branch-scope-note.tsx`.
        */}
        {branchScope ? <BranchScopeNote scope={branchScope} /> : null}

        {active === 'overview' ? <OverviewView data={overview} /> : null}
        {active === 'sales' ? <SalesView /> : null}
        {active === 'members' ? <MembersView /> : null}
        {active === 'revenue' ? <RevenueView /> : null}
        {active === 'classes' ? <ClassesView /> : null}
        {active === 'staff' ? <StaffView /> : null}
      </div>
    </div>
  );
}
