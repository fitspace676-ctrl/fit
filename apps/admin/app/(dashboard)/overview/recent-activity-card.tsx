'use client';

// The two recent-row feeds behind one switch.
//
// Check-ins and new members are the same kind of thing — a short list of what
// just happened — and as two full-width cards at the foot of the page they cost
// two surfaces to say it. One card with a two-tab switch says it in the rail.
//
// The tab bar reuses `useRovingTablist`, the hook the segment bar is built on, so
// arrow/Home/End behave identically in both places.

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import type { DashboardOverviewResponse } from '@fit/types';
import { useRovingTablist } from '../segments/use-roving-tablist';
import { LiveNowPill, RecentCheckInsBody, RecentMembersBody } from './recent-cards';

const FEEDS = ['checkIns', 'members'] as const;
type Feed = (typeof FEEDS)[number];

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  tabs: {
    display: 'flex',
    alignItems: 'center',
    // The tab labels take the space; the live pill is pushed to the far end.
    justifyContent: 'space-between',
    gap: '0.25rem',
    paddingInline: '1.25rem',
    paddingTop: '1rem',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  tabList: {
    display: 'flex',
    gap: '0.25rem',
  },
  tab: {
    marginBottom: '-1px',
    borderWidth: 0,
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    backgroundColor: 'transparent',
    paddingInline: '0.25rem',
    paddingBottom: '0.625rem',
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    outline: 'none',
    ':hover': { color: 'var(--color-text-primary)' },
    ':focus-visible': { outline: '2px solid var(--color-accent)', outlineOffset: '-2px' },
  },
  active: {
    borderBottomColor: 'var(--color-accent)',
    color: 'var(--color-accent)',
  },
  body: {
    paddingInline: '1.25rem',
    paddingBlock: '1rem',
  },
});

export function RecentActivityCard({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const [feed, setFeed] = useState<Feed>('checkIns');
  const { registerRef, onKeyDown } = useRovingTablist(FEEDS, setFeed);

  const labels: Record<Feed, string> = {
    checkIns: t('recentCheckIns.title'),
    members: t('recentMembers.title'),
  };

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.tabs)}>
        <div role="tablist" aria-label={t('recentActivity.aria')} {...stylex.props(styles.tabList)}>
          {FEEDS.map((value, index) => {
            const isActive = value === feed;
            return (
              <button
                key={value}
                id={`recent-activity-tab-${value}`}
                aria-controls="recent-activity-panel"
                ref={registerRef(index)}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setFeed(value)}
                onKeyDown={(event) => onKeyDown(event, index)}
                {...stylex.props(styles.tab, isActive && styles.active)}
              >
                {labels[value]}
              </button>
            );
          })}
        </div>
        {/* The live pill belonged to the check-ins card's own head; it follows
            that feed rather than sitting over the members list too. */}
        {feed === 'checkIns' ? <LiveNowPill /> : null}
      </div>
      {/*
        The tab row above is inset 1.25rem; this wrapper restores the same
        inset for the body, which `Card`'s own `padding={0}` (needed so the
        tab row's border can run edge-to-edge) does not supply.

        It also completes the tablist/tabpanel pair: each tab points here via
        `aria-controls`, and this points back at whichever tab is active via
        `aria-labelledby` — the same wiring `segment-tabs.tsx` /
        `segmented-dashboard.tsx` use, and the panel this card was missing
        entirely once its own `<h2>`s were removed. No `tabIndex={0}`: the
        body is full of interactive rows, so the APG does not call for a tab
        stop on the container itself.
      */}
      <div
        id="recent-activity-panel"
        role="tabpanel"
        aria-labelledby={`recent-activity-tab-${feed}`}
        {...stylex.props(styles.body)}
      >
        {feed === 'checkIns' ? (
          <RecentCheckInsBody data={data} />
        ) : (
          <RecentMembersBody data={data} />
        )}
      </div>
    </Card>
  );
}
