// `/services/:id` — the service, its week of slots, and the one action on this
// stack that costs money.
//
// `renderApp` rather than `renderScreen`: this screen raises a TOAST (the
// booking confirmation and the lost-race message), and a toast needs the
// `ToastProvider` the root layout mounts.
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, waitFor } from '@testing-library/react-native';
import type { MemberServiceSession, ServiceCard, ServiceSlot } from '@fit/types';

import ServiceDetailScreen from './[id]';
import { ApiError } from '../../lib/http/api-error';
import { renderApp } from '../../test-support/render';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;
let mockParams: { id?: string } = { id: 'svc_pt' };
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
}));

// The discovery seam is mocked, not the query hooks it feeds: this file tests
// the SCREEN's three branches, and `hooks/useDiscoveryGym.spec.ts` +
// `hooks/useDiscoveryGym.test.tsx` test the seam itself.
const mockGymRetry = jest.fn();
let mockGym = {
  gymId: 'gym_1' as string | null,
  isPending: false,
  isError: false,
  retry: mockGymRetry,
};
jest.mock('../../hooks/useDiscoveryGym', () => ({
  useDiscoveryGym: () => mockGym,
}));

let mockSignedIn = true;
jest.mock('../../hooks/useSession', () => ({ useIsSignedIn: () => mockSignedIn }));
jest.mock('../../hooks/useActiveGym', () => ({ useGymId: () => (mockSignedIn ? 'gym_1' : null) }));

const mockListServices = jest.fn();
const mockListSlots = jest.fn();
const mockListMine = jest.fn();
jest.mock('../../hooks/queries/useServices', () => ({
  SERVICES_KEY_GAP: (gymId: string) => ['services', gymId],
  servicesQueryOptions: (gymId: string | null) => ({
    queryKey: ['services', gymId ?? ''],
    queryFn: () => mockListServices() as unknown,
    enabled: gymId !== null,
  }),
  // Mirrors `queryKeys.serviceSlots(gymId, serviceId, {from, to})` so the
  // calendar's own retry — and the lost-race invalidation, which targets the
  // two-segment ROOT — hit this query for real.
  serviceSlotsQueryOptions: (
    gymId: string | null,
    range: { serviceId?: string; from: string; to: string },
  ) => ({
    queryKey: [
      'serviceSlots',
      gymId ?? '',
      range.serviceId ?? 'all',
      { from: range.from, to: range.to },
    ],
    queryFn: () => mockListSlots() as unknown,
    enabled: gymId !== null,
  }),
  myServiceSessionsQueryOptions: (gymId: string | null) => ({
    queryKey: ['myServiceSessions', gymId ?? '', null],
    queryFn: () => mockListMine() as unknown,
    enabled: gymId !== null,
  }),
}));

const mockMutate = jest.fn();
let mockBookPending = false;
jest.mock('../../hooks/mutations/useServiceSessionMutations', () => ({
  useBookServiceSession: () => ({ mutate: mockMutate, isPending: mockBookPending }),
}));

const SERVICE: ServiceCard = {
  id: 'svc_pt',
  type: 'PERSONAL_TRAINING',
  name: 'PT — Nino Beridze',
  description: 'One to one, sixty minutes.',
  priceMinor: 12000,
  currency: 'GEL',
  durationMinutes: 60,
  coverUrl: null,
  schedule: null,
  staff: { id: 'st_1', name: 'Nino Beridze', photoUrl: null },
};

/** Today at 18:00 local — inside the current week, on the day selected by default. */
function todayAt(hour: number): string {
  const when = new Date();
  when.setHours(hour, 0, 0, 0);
  return when.toISOString();
}

const SLOT: ServiceSlot = {
  id: 'ss_1',
  serviceId: 'svc_pt',
  serviceName: 'PT — Nino Beridze',
  serviceType: 'PERSONAL_TRAINING',
  staffName: 'Nino Beridze',
  startsAt: todayAt(18),
  endsAt: todayAt(19),
  durationMinutes: 60,
  priceMinor: 12000,
  currency: 'GEL',
};

const BOOKED: MemberServiceSession = {
  id: 'ss_0',
  serviceId: 'svc_pt',
  serviceName: 'PT — Nino Beridze',
  serviceType: 'PERSONAL_TRAINING',
  staffName: 'Nino Beridze',
  startsAt: todayAt(9),
  endsAt: todayAt(10),
  status: 'BOOKED',
  invoice: { id: 'inv_1', number: 'INV-0007', amount: 12000, currency: 'GEL', status: 'PENDING' },
};

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockBack.mockClear();
  mockMutate.mockReset();
  mockCanGoBack = true;
  mockBookPending = false;
  mockSignedIn = true;
  mockParams = { id: 'svc_pt' };
  mockGymRetry.mockClear();
  mockGym = { gymId: 'gym_1', isPending: false, isError: false, retry: mockGymRetry };
  mockListServices.mockReset().mockResolvedValue({ services: [SERVICE] });
  mockListSlots.mockReset().mockResolvedValue({ slots: [SLOT] });
  mockListMine.mockReset().mockResolvedValue({ sessions: [] });
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

/**
 * The text of each `role="header"`, typed.
 *
 * RNTL types a host node's `props` as `any`, so `node.props.children` is three
 * `no-unsafe-*` lint errors at every call site. Narrowed once here — inline
 * rather than in `test-support/`, which C1 owns for this stage, exactly as
 * the other screen tests do for `accessibilityState`.
 */
function headerTexts(nodes: readonly unknown[]): string[] {
  return nodes.map((node) => String((node as { props?: { children?: unknown } }).props?.children));
}

describe('the service', () => {
  it('renders the hero, the description and the price', async () => {
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('service-hero');
    expect(view.getByText('One to one, sixty minutes.')).toBeTruthy();
    expect(view.getByText('With Nino Beridze · 60 min')).toBeTruthy();
    expect(view.getByText('GEL 120.00')).toBeTruthy();
    expect(view.getByText('Personal training')).toBeTruthy();
  });

  it('shows skeletons first', () => {
    const view = renderApp(<ServiceDetailScreen />);
    expect(view.getByTestId('service-loading')).toBeTruthy();
  });

  it('has an ERROR with a working retry', async () => {
    mockListServices.mockRejectedValueOnce(new Error('boom'));
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('service-error');

    mockListServices.mockResolvedValue({ services: [SERVICE] });
    fireEvent.press(view.getByTestId('service-retry'));
    await view.findByTestId('service-hero');
    expect(mockListServices).toHaveBeenCalledTimes(2);
  });

  it('has a NOT-FOUND branch with NO retry — there is no `GET /services/:id`', async () => {
    // The detail reads the catalogue and finds the id in it, so a miss means
    // "not in this gym's ACTIVE catalogue". Retrying fetches the same list and
    // misses again, so offering a retry would be offering a dead control.
    mockParams = { id: 'svc_gone' };
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('service-not-found');
    expect(view.queryByTestId('service-retry')).toBeNull();

    mockCanGoBack = false;
    fireEvent.press(view.getByTestId('service-not-found-back'));
    expect(mockReplace).toHaveBeenCalledWith('/services');
  });

  it('renders an OFFLINE branch rather than skeletons forever', async () => {
    onlineManager.setOnline(false);
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('service-offline');
    expect(view.queryByTestId('service-loading')).toBeNull();
  });

  it('SAYS the radio is out, on the detail AND on the slot calendar', async () => {
    // Both branches drew skeletons that a paused query can never resolve.
    // TODO(i18n) `common.offline.*`.
    onlineManager.setOnline(false);
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('service-offline');
    expect(view.getAllByText("You're offline").length).toBeGreaterThan(0);
  });

  it('has the screen title first, then its sections, in order', async () => {
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('service-hero');
    expect(headerTexts(view.getAllByRole('header'))).toEqual([
      'Personal training - Nino Beridze',
      'Pick a free slot',
    ]);
  });
});

describe('the slot calendar', () => {
  it('lists the selected day s free slots and keeps its toolbar in every state', async () => {
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('slot-calendar-slots');
    expect(view.getByTestId('slot-ss_1')).toBeTruthy();
    expect(view.getByTestId('slot-calendar-toolbar')).toBeTruthy();
  });

  it('steps a week at a time and refetches the new window', async () => {
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('slot-calendar-slots');
    const before = mockListSlots.mock.calls.length;

    fireEvent.press(view.getByLabelText('Next week'));
    await waitFor(() => {
      expect(mockListSlots.mock.calls.length).toBeGreaterThan(before);
    });
    // Next week has no slots seeded under today s key, so the day reads empty.
    await view.findByTestId('slot-calendar-empty');

    fireEvent.press(view.getByLabelText('This week'));
    await view.findByTestId('slot-calendar-slots');
  });

  it('has its OWN error and retry, and the toolbar survives it', async () => {
    mockListSlots.mockRejectedValueOnce(new Error('boom'));
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('slot-calendar-error');
    // The service itself is untouched — a failed week must not blank the page.
    expect(view.getByTestId('service-hero')).toBeTruthy();
    expect(view.getByTestId('slot-calendar-toolbar')).toBeTruthy();

    mockListSlots.mockResolvedValue({ slots: [SLOT] });
    fireEvent.press(view.getByTestId('slot-calendar-retry'));
    await view.findByTestId('slot-calendar-slots');
  });

  it('spells the whole day out for a screen reader, dot included', async () => {
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('slot-calendar-slots');
    // The dot is the only thing on a `DayCell` that says whether a day has
    // anything, and a dot is not something a screen reader can read.
    const labels = view
      .getAllByTestId(/^slot-day-/)
      .map((node) => String(node.props.accessibilityLabel));
    expect(labels.some((label) => label.endsWith('1 session'))).toBe(true);
    expect(labels.filter((label) => label.endsWith('No free slots'))).toHaveLength(6);
  });
});

describe('booking — the auth-soft boundary', () => {
  it('prompts a signed-out visitor at the CTA, and returns them here', async () => {
    mockSignedIn = false;
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('slot-calendar-slots');

    // Everything above the CTA renders signed out. That is the whole point of
    // the `auth-soft` policy, and the defect §1 lists.
    expect(view.getByTestId('service-hero')).toBeTruthy();

    fireEvent.press(view.getByTestId('slot-ss_1'));
    const confirm = await view.findByText('Sign in to book');
    fireEvent.press(confirm);
    expect(mockPush).toHaveBeenCalledWith('/login?next=%2Fservices%2Fsvc_pt');
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('hides "Your sessions" entirely when signed out', async () => {
    mockSignedIn = false;
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('slot-calendar-slots');
    expect(view.queryByTestId('my-sessions')).toBeNull();
    expect(mockListMine).not.toHaveBeenCalled();
  });

  it('confirms in a sheet that names the slot and warns about the invoice', async () => {
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('slot-calendar-slots');
    fireEvent.press(view.getByTestId('slot-ss_1'));

    await view.findByTestId('booking-sheet');
    expect(view.getAllByText('Personal training - Nino Beridze').length).toBeGreaterThan(0);
    expect(
      view.getByText(
        'Booking issues an invoice for the session price. Pay at the front desk before the session.',
      ),
    ).toBeTruthy();
    expect(view.getByText('Book this slot')).toBeTruthy();
  });

  it('books, closes the sheet and says so', async () => {
    mockMutate.mockImplementation((_input: unknown, options: { onSuccess: () => void }) => {
      options.onSuccess();
    });
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('slot-calendar-slots');
    fireEvent.press(view.getByTestId('slot-ss_1'));
    fireEvent.press(await view.findByText('Book this slot'));

    expect(mockMutate).toHaveBeenCalledWith({ sessionId: 'ss_1' }, expect.anything());
    await waitFor(() => {
      expect(view.getByText('Booked')).toBeTruthy();
    });
  });

  it('returns a LOST RACE to the calendar rather than to a dead end', async () => {
    // `SESSION_TAKEN` is a 409 from a conditional update that claimed nothing:
    // someone pressed first. Retrying can never succeed, so the sheet closes,
    // the message is a toast, and the slot list is invalidated so the taken
    // time disappears.
    mockMutate.mockImplementation(
      (_input: unknown, options: { onError: (error: unknown) => void }) => {
        options.onError(new ApiError({ status: 409, code: 'SESSION_TAKEN' }));
      },
    );
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('slot-calendar-slots');
    const before = mockListSlots.mock.calls.length;

    fireEvent.press(view.getByTestId('slot-ss_1'));
    fireEvent.press(await view.findByText('Book this slot'));

    await waitFor(() => {
      expect(view.getByText('Someone just took that slot. Pick another one.')).toBeTruthy();
    });
    expect(view.queryByTestId('booking-error')).toBeNull();
    await waitFor(() => {
      expect(mockListSlots.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('keeps every OTHER failure in the sheet, beside a live confirm button', async () => {
    mockMutate.mockImplementation(
      (_input: unknown, options: { onError: (error: unknown) => void }) => {
        options.onError(new ApiError({ status: 409, code: 'SESSION_PAST' }));
      },
    );
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('slot-calendar-slots');
    fireEvent.press(view.getByTestId('slot-ss_1'));
    fireEvent.press(await view.findByText('Book this slot'));

    await view.findByTestId('booking-error');
    expect(view.getByText('That slot has already started.')).toBeTruthy();
    // The sheet is still open and still offers the action.
    expect(view.getByText('Book this slot')).toBeTruthy();
  });

  it('maps an unknown code to the generic sentence', async () => {
    mockMutate.mockImplementation(
      (_input: unknown, options: { onError: (error: unknown) => void }) => {
        options.onError(new ApiError({ status: 500, code: 'SOMETHING_NEW' }));
      },
    );
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('slot-calendar-slots');
    fireEvent.press(view.getByTestId('slot-ss_1'));
    fireEvent.press(await view.findByText('Book this slot'));

    await view.findByTestId('booking-error');
    expect(view.getByText('We could not book that slot. Please try again.')).toBeTruthy();
  });
});

describe('your sessions', () => {
  it('lists the member s own bookings of THIS service, with the invoice', async () => {
    mockListMine.mockResolvedValue({
      sessions: [BOOKED, { ...BOOKED, id: 'ss_other', serviceId: 'svc_other' }],
    });
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('my-sessions');

    expect(view.getByTestId('my-session-ss_0')).toBeTruthy();
    // Another service's session is not this service's business.
    expect(view.queryByTestId('my-session-ss_other')).toBeNull();
    expect(view.getByText('INV-0007 · GEL 120.00 · unpaid')).toBeTruthy();
    expect(view.getByText('Booked')).toBeTruthy();
  });

  it('renders NOTHING at all when the member has none', async () => {
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('slot-calendar-slots');
    expect(view.queryByTestId('my-sessions')).toBeNull();
  });

  it('SAYS SO when the sessions query fails, instead of vanishing the receipt', async () => {
    // The section is where the invoice number and the PENDING status live. With
    // `[]` standing in for a failed read it rendered NOTHING — heading and all —
    // so a member who had just booked lost their only receipt the moment the
    // success toast dismissed, and nothing anywhere said a request had failed.
    mockListMine.mockRejectedValue(new Error('boom'));
    const view = renderApp(<ServiceDetailScreen />);

    await view.findByTestId('my-sessions-error');
    // The heading survives its own failure — otherwise "we couldn't load this"
    // sits on the page with nothing saying what "this" was.
    expect(view.getByText('Your sessions')).toBeTruthy();
    // `account.bookings.error`, the sentence `profile/bookings.tsx` renders for
    // this same query — real copy in both locales, not `services.error`.
    expect(view.getByText('We couldn’t load your bookings. Please try again.')).toBeTruthy();

    // And the retry actually re-reads it.
    const before = mockListMine.mock.calls.length;
    mockListMine.mockResolvedValue({ sessions: [BOOKED] });
    fireEvent.press(view.getByTestId('my-sessions-retry'));
    await waitFor(() => {
      expect(mockListMine.mock.calls.length).toBeGreaterThan(before);
    });
    await view.findByTestId('my-session-ss_0');
  });

  it('skeletons the section while it loads, rather than claiming none', async () => {
    let release: ((value: { sessions: unknown[] }) => void) | undefined;
    mockListMine.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('my-sessions-loading');
    release?.({ sessions: [] });
  });

  it('offers NO cancel anywhere — there is no member endpoint behind one', async () => {
    // `admin/service-sessions/:id/cancel` is `ClassWrite`. Plan §7 records it:
    // a member can book a session and cannot release one. This assertion is the
    // guard against someone "completing" the screen with a button that 403s.
    mockListMine.mockResolvedValue({ sessions: [BOOKED] });
    const view = renderApp(<ServiceDetailScreen />);
    await view.findByTestId('my-sessions');
    expect(view.queryByText('Cancel')).toBeNull();
    expect(JSON.stringify(view.toJSON())).not.toMatch(/cancel-session/i);
  });
});

describe('copy', () => {
  it('is entirely from the catalogue, in both locales', async () => {
    const ka = renderApp(<ServiceDetailScreen />, { locale: 'ka' });
    await ka.findByTestId('service-hero');
    const tree = JSON.stringify(ka.toJSON());

    expect(ka.getByText('აირჩიე თავისუფალი დრო')).toBeTruthy();
    expect(ka.queryByText('Pick a free slot')).toBeNull();
    expect(ka.getByText('120,00 ₾')).toBeTruthy();
    expect(tree).not.toMatch(/services\.(card|type|detail|calendar|booking|mine)\./);
  });
});
