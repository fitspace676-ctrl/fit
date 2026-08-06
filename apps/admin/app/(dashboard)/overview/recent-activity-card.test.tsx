import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardOverviewResponse } from '@fit/types';

// The two feeds are already covered by their own rendering; this test is about
// the switch between them, so stand them in with markers.
vi.mock('./recent-cards', () => ({
  RecentCheckInsCard: () => <div>check-ins feed</div>,
  RecentMembersCard: () => <div>members feed</div>,
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
      <RecentActivityCard data={{} as DashboardOverviewResponse} />
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
});
