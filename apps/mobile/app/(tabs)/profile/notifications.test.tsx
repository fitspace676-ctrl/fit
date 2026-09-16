// `/profile/notifications` — the inbox, and the href table under it.
//
// `routeForHref` is the interesting unit here: `NotificationDto.href` is
// authored by the API for the member PORTAL (`/member/...`), whose routes are
// not this app's, and handing it to `router.push` verbatim is how a tap lands on
// expo-router's "Unmatched Route" screen.
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, waitFor } from '@testing-library/react-native';

import NotificationsScreen, { routeForHref } from './notifications';
import { renderApp } from '../../../test-support/render';

jest.setTimeout(30_000);
const WAIT = { timeout: 10_000 };

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('../../../hooks/useActiveGym', () => ({
  useGymId: () => 'gym_1',
  useActiveGym: () => ({ gymId: 'gym_1', role: 'MEMBER', userId: 'user_1' }),
}));

const mockList = jest.fn();
const mockMarkRead = jest.fn();
jest.mock('../../../lib/api/notifications', () => ({
  listNotifications: () => mockList() as unknown,
  getUnreadCount: () => Promise.resolve({ unread: 0 }),
  markNotificationsRead: (input: unknown) => mockMarkRead(input) as unknown,
  registerPushToken: () => Promise.resolve({}),
  unregisterPushToken: () => Promise.resolve(undefined),
}));

const ITEMS = [
  {
    id: 'n1',
    category: 'BOOKING' as const,
    title: 'You are off the waitlist',
    body: 'A seat opened up in Morning Spin.',
    href: '/member/bookings',
    readAt: null,
    createdAt: '2026-08-30T09:00:00.000Z',
  },
  {
    id: 'n2',
    category: 'BILLING' as const,
    title: 'Payment received',
    body: 'Thanks!',
    href: null,
    readAt: '2026-08-30T10:00:00.000Z',
    createdAt: '2026-08-29T09:00:00.000Z',
  },
];

beforeEach(() => {
  mockPush.mockClear();
  mockList.mockReset();
  mockMarkRead.mockReset();
  mockList.mockResolvedValue({ data: ITEMS, total: 2, page: 1, limit: 20, unread: 1 });
  mockMarkRead.mockResolvedValue({ unread: 0 });
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('the portal href table', () => {
  it.each([
    ['/member/bookings', '/profile/bookings'],
    ['/bookings', '/profile/bookings'],
    ['/member/classes/abc', '/classes/abc'],
    ['/member/account/membership', '/profile/membership'],
    ['/member/account/billing', '/profile/billing'],
    ['/member/shop', '/shop'],
    ['/member/trainers', '/trainers'],
    ['/member/services', '/services'],
  ])('maps %s to %s', (href, expected) => {
    expect(routeForHref(href)).toBe(expected);
  });

  it('navigates NOWHERE for an href this app has no route for', () => {
    // A dead-end tap is a small annoyance; an unmatched route is a broken app.
    expect(routeForHref('/member/some-future-screen')).toBeNull();
    expect(routeForHref(null)).toBeNull();
  });
});

describe('the inbox', () => {
  it('lists the page and says which rows are unread', async () => {
    const { findByTestId, getByTestId } = renderApp(<NotificationsScreen />);
    await findByTestId('notifications-item-n1', {}, WAIT);
    // The dot is inside the row's ONE accessibility node, so "Notifications"
    // (the unread marker's only word in this namespace) has to be in the label.
    expect(getByTestId('notifications-item-n1').props.accessibilityLabel).toMatch(
      /^Notifications, You are off the waitlist/,
    );
    expect(getByTestId('notifications-item-n2').props.accessibilityLabel).toMatch(
      /^Payment received/,
    );
  });

  it('marks a row read on the way out, and routes through the table', async () => {
    const { findByTestId } = renderApp(<NotificationsScreen />);
    fireEvent.press(await findByTestId('notifications-item-n1', {}, WAIT));
    await waitFor(() => {
      expect(mockMarkRead).toHaveBeenCalledWith({ ids: ['n1'] });
    }, WAIT);
    expect(mockPush).toHaveBeenCalledWith('/profile/bookings');
  });

  it('does not re-mark an already-read row, and does not navigate on a null href', async () => {
    const { findByTestId } = renderApp(<NotificationsScreen />);
    fireEvent.press(await findByTestId('notifications-item-n2', {}, WAIT));
    expect(mockMarkRead).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('marks ALL read with no argument — the endpoint s own "mark all" form', async () => {
    const { findByTestId } = renderApp(<NotificationsScreen />);
    fireEvent.press(await findByTestId('notifications-mark-all', {}, WAIT));
    await waitFor(() => {
      expect(mockMarkRead).toHaveBeenCalled();
    }, WAIT);
    // `mock.calls` is `any[][]`, so it is narrowed rather than indexed raw.
    expect((mockMarkRead.mock.calls as unknown as unknown[][])[0]?.[0]).toEqual({});
  });

  it('SAYS SO when a mark-read fails, rather than leaving the dot unexplained', async () => {
    // The mutation is otherwise invisible: on success the dot goes, on failure
    // it stays exactly where it was. Without this there is nothing on screen
    // that distinguishes "the server refused" from "I misread the row".
    mockMarkRead.mockRejectedValue(new Error('boom'));
    const { findByTestId, findByText } = renderApp(<NotificationsScreen />);
    fireEvent.press(await findByTestId('notifications-item-n1', {}, WAIT));
    // TODO(i18n) `notifications.markReadError` — the English placeholder.
    expect(await findByText("We couldn't update your notifications.", {}, WAIT)).toBeTruthy();
  });

  it('SAYS SO when "mark all read" fails', async () => {
    mockMarkRead.mockRejectedValue(new Error('boom'));
    const { findByTestId, findByText } = renderApp(<NotificationsScreen />);
    fireEvent.press(await findByTestId('notifications-mark-all', {}, WAIT));
    expect(await findByText("We couldn't update your notifications.", {}, WAIT)).toBeTruthy();
  });

  it('hides "mark all read" when there is nothing unread', async () => {
    mockList.mockResolvedValue({ data: ITEMS, total: 2, page: 1, limit: 20, unread: 0 });
    const { findByTestId, queryByTestId } = renderApp(<NotificationsScreen />);
    await findByTestId('notifications-list', {}, WAIT);
    expect(queryByTestId('notifications-mark-all')).toBeNull();
  });
});

describe('§6', () => {
  it('skeletons while the page loads', () => {
    const { getByTestId } = renderApp(<NotificationsScreen />);
    expect(getByTestId('notifications-loading')).toBeTruthy();
  });

  it('empties', async () => {
    mockList.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, unread: 0 });
    const { findByTestId } = renderApp(<NotificationsScreen />);
    await findByTestId('notifications-empty', {}, WAIT);
  });

  it('errors with a working retry', async () => {
    mockList.mockRejectedValueOnce(new Error('boom'));
    const { findByTestId, getByTestId } = renderApp(<NotificationsScreen />);
    await findByTestId('notifications-error', {}, WAIT);
    mockList.mockResolvedValue({ data: ITEMS, total: 2, page: 1, limit: 20, unread: 1 });
    fireEvent.press(getByTestId('notifications-retry'));
    await findByTestId('notifications-list', {}, WAIT);
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('renders an offline branch', async () => {
    onlineManager.setOnline(false);
    const { getByTestId } = renderApp(<NotificationsScreen />);
    await waitFor(() => {
      expect(getByTestId('notifications-offline')).toBeTruthy();
    }, WAIT);
  });
});

describe('the chrome', () => {
  it('announces exactly one header — the screen title', async () => {
    const { findByTestId, getAllByRole } = renderApp(<NotificationsScreen />);
    await findByTestId('notifications-list', {}, WAIT);
    const headers = getAllByRole('header').map(
      (node) => (node as unknown as { props?: { children?: unknown } }).props?.children,
    );
    expect(headers).toEqual(['Notifications']);
  });

  it('offers the device-local settings screen', async () => {
    const { findByTestId } = renderApp(<NotificationsScreen />);
    fireEvent.press(await findByTestId('notifications-settings', {}, WAIT));
    expect(mockPush).toHaveBeenCalledWith('/profile/notification-settings');
  });

  it('renders no key paths, in either locale', async () => {
    for (const locale of ['en', 'ka'] as const) {
      const screen = renderApp(<NotificationsScreen />, { locale });
      await screen.findByTestId('notifications-list', {}, WAIT);
      expect(JSON.stringify(screen.toJSON())).not.toMatch(/"notifications\./i);
      screen.unmount();
    }
  });
});
