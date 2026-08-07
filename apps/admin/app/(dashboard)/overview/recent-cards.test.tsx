import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardOverviewResponse } from '@fit/types';
import { RecentCheckInsBody, RecentMembersBody } from './recent-cards';

const messages = {
  admin: {
    dashboard: {
      recentCheckIns: { empty: 'No check-ins yet.', noPlan: 'No plan' },
      recentMembers: { empty: 'No members yet.', noPlan: 'No plan' },
      timeAgo: { minutes: '{count}m ago', hours: '{count}h ago', days: '{count}d ago' },
    },
  },
};

/** A name long enough that the rail's 2-column grid must ellipsise it. */
const LONG_NAME = 'Ekaterine Kvaratskhelia-Beridze';

function data(): DashboardOverviewResponse {
  return {
    recentCheckIns: [
      {
        memberId: 'm1',
        name: LONG_NAME,
        planName: 'Unlimited annual membership',
        checkedInAt: '2026-08-07T10:00:00Z',
      },
    ],
    recentMembers: [
      {
        id: 'm1',
        name: LONG_NAME,
        planName: 'Unlimited annual membership',
        status: 'ACTIVE',
        expiresAt: null,
      },
    ],
  } as unknown as DashboardOverviewResponse;
}

function renderBody(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );
}

// The rail is `minmax(280px, 1fr)` and each row holds an avatar, two lines and a
// badge, so a real Georgian name ellipsises down to a letter or two. The row is
// the only place the console says who checked in or who joined, so it has to give
// the name back — as a tooltip that floats, and as a link that opens the person.
describe('recent feeds', () => {
  it.each([
    ['check-ins', <RecentCheckInsBody key="c" data={data()} />],
    ['members', <RecentMembersBody key="m" data={data()} />],
  ])('carries the full name and detail in the %s feed row', (_label, node) => {
    renderBody(node);
    const title = screen.getByRole('link').getAttribute('title') ?? '';
    expect(title).toContain(LONG_NAME);
    expect(title).toContain('Unlimited annual membership');
  });

  // The floating copy is what a hover actually shows: the clipped text stays
  // clipped, and this sits above the row instead of reflowing it.
  it.each([
    ['check-ins', <RecentCheckInsBody key="c" data={data()} />],
    ['members', <RecentMembersBody key="m" data={data()} />],
  ])('renders a floating copy of the name in the %s feed', (_label, node) => {
    const { container } = renderBody(node);
    const tip = container.querySelector('[aria-hidden="true"]');
    expect(container.textContent).toContain(LONG_NAME);
    expect(tip).not.toBeNull();
  });

  it('opens the member behind a check-in row', () => {
    renderBody(<RecentCheckInsBody data={data()} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/members/m1');
  });

  it('opens the member behind a recent-members row', () => {
    renderBody(<RecentMembersBody data={data()} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/members/m1');
  });
});
