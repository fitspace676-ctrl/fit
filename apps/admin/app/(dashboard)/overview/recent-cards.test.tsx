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
// badge, so a real Georgian name ellipsises down to a letter or two. The text is
// still THERE — it just cannot be read, and the row is the only place the console
// shows who checked in. A `title` gives it back on hover, which is what
// `BarChart` and `Heatmap` already do for their own clipped labels.
describe('recent feeds', () => {
  it.each([
    ['check-ins', <RecentCheckInsBody key="c" data={data()} />],
    ['members', <RecentMembersBody key="m" data={data()} />],
  ])('reveals the full name on hover in the %s feed', (_label, node) => {
    renderBody(node);
    expect(screen.getByText(LONG_NAME)).toHaveAttribute('title', LONG_NAME);
  });

  it.each([
    ['check-ins', <RecentCheckInsBody key="c" data={data()} />],
    ['members', <RecentMembersBody key="m" data={data()} />],
  ])('reveals the clipped detail line too in the %s feed', (_label, node) => {
    const { container } = renderBody(node);
    const detail = container.querySelector('[title*="Unlimited annual membership"]');
    expect(detail).not.toBeNull();
  });
});
