import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DashboardOverviewResponse } from '@fit/types';
import { OverviewView } from './overview-view';

const { refresh, useLiveRefresh } = vi.hoisted(() => ({
  refresh: vi.fn(),
  useLiveRefresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next-intl', () => ({ useLocale: () => 'en' }));
vi.mock('@/hooks/use-live-refresh', () => ({
  useLiveRefresh,
  LIVE_REFRESH_MS: { dashboard: 30_000 },
}));
vi.mock('./metric-strip', () => ({ MetricStrip: () => null }));
vi.mock('./in-gym-now', () => ({ InGymNow: () => null }));
vi.mock('./revenue-card', () => ({ RevenueCard: () => null }));
vi.mock('./plan-mix-card', () => ({ PlanMixCard: () => null }));
vi.mock('./schedule-card', () => ({ ScheduleCard: () => null }));
vi.mock('./alerts-card', () => ({ AlertsCard: () => null }));
vi.mock('./recent-activity-card', () => ({ RecentActivityCard: () => null }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('renders without live refresh registration, idle refreshes or refocus refreshes', () => {
  vi.useFakeTimers();
  render(<OverviewView data={{ currency: 'GEL' } as DashboardOverviewResponse} />);
  act(() => {
    vi.advanceTimersByTime(120_000);
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(useLiveRefresh).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});
