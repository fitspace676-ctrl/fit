import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardOverviewResponse } from '@fit/types';
import { ThemeProvider } from '@/components/theme/theme-provider';

// The two feeds are already covered by their own rendering; this test is about
// the switch between them, so stand them in with markers.
vi.mock('./recent-cards', () => ({
  RecentCheckInsBody: () => <div>check-ins feed</div>,
  RecentMembersBody: () => <div>members feed</div>,
  LiveNowPill: () => <span>live</span>,
}));

const { RecentActivityCard } = await import('./recent-activity-card');

const messages = {
  admin: {
    dashboard: {
      recentActivity: { aria: 'Recent activity' },
      recentCheckIns: { title: 'Recent check-ins' },
      recentMembers: { title: 'Recent members' },
    },
  },
};

function renderCard() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ThemeProvider initial="dark">
        <RecentActivityCard data={{} as DashboardOverviewResponse} />
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
}

describe('RecentActivityCard', () => {
  it('opens on the check-ins feed', () => {
    renderCard();
    expect(screen.getByText('check-ins feed')).toBeInTheDocument();
    expect(screen.queryByText('members feed')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Recent check-ins' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('switches to the members feed and back', async () => {
    renderCard();
    await userEvent.click(screen.getByRole('tab', { name: 'Recent members' }));
    expect(screen.getByText('members feed')).toBeInTheDocument();
    expect(screen.queryByText('check-ins feed')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Recent check-ins' }));
    expect(screen.getByText('check-ins feed')).toBeInTheDocument();
  });

  it('keeps only the selected tab in the tab order', () => {
    renderCard();
    expect(screen.getByRole('tab', { name: 'Recent check-ins' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Recent members' })).toHaveAttribute('tabindex', '-1');
  });

  // Each tab must name the panel it drives, and the panel must point back at
  // whichever tab is active — the same tablist/tabpanel wiring the segment bar
  // carries (`segment-tabs.test.tsx`). This also pins the panel wrapper Critical
  // 2 depends on for the body's inset: if the wrapper were removed, the feed
  // marker would render as a direct child of the tabpanel-less `<div>` (or of
  // the card itself) and `getByRole('tabpanel')` would stop finding an ancestor
  // that contains it, failing this assertion.
  it('wires each tab to the panel it controls, and the panel back to the active tab', () => {
    renderCard();
    const checkInsTab = screen.getByRole('tab', { name: 'Recent check-ins' });
    const membersTab = screen.getByRole('tab', { name: 'Recent members' });
    const panel = screen.getByRole('tabpanel');

    expect(checkInsTab).toHaveAttribute('id', 'recent-activity-tab-checkIns');
    expect(membersTab).toHaveAttribute('id', 'recent-activity-tab-members');
    expect(checkInsTab).toHaveAttribute('aria-controls', panel.id);
    expect(membersTab).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', 'recent-activity-tab-checkIns');
    expect(panel).toContainElement(screen.getByText('check-ins feed'));
  });
});
