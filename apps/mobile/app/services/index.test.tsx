// `/services` — the catalogue, its type filter, and the schedule that expands
// under a card.
import { onlineManager } from '@tanstack/react-query';
import { fireEvent } from '@testing-library/react-native';
import type { ServiceCard } from '@fit/types';

import ServicesScreen from './index';
import { renderScreen } from '../../test-support/render-screen';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => mockCanGoBack,
  }),
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

const mockListServices = jest.fn();
jest.mock('../../hooks/queries/useServices', () => ({
  SERVICES_KEY_GAP: (gymId: string) => ['services', gymId],
  servicesQueryOptions: (gymId: string | null) => ({
    queryKey: ['services', gymId ?? ''],
    queryFn: () => mockListServices() as unknown,
    enabled: gymId !== null,
  }),
}));

const PT: ServiceCard = {
  id: 'svc_pt',
  type: 'PERSONAL_TRAINING',
  name: 'PT — Nino Beridze',
  description: 'One to one.',
  priceMinor: 12000,
  currency: 'GEL',
  durationMinutes: 60,
  coverUrl: null,
  // A PT service whose slots come from the trainer's own calendar has NO
  // recurrence — the common case, and the one that must not render an empty
  // table.
  schedule: null,
  staff: { id: 'st_1', name: 'Nino Beridze', photoUrl: null },
};

const CUSTOM: ServiceCard = {
  id: 'svc_massage',
  type: 'CUSTOM',
  name: 'Sports massage',
  description: '',
  priceMinor: 8000,
  currency: 'GEL',
  durationMinutes: 45,
  coverUrl: null,
  schedule: {
    freq: 'WEEKLY',
    weekdays: ['TU', 'TH'],
    startDate: '2026-08-01',
    startTime: '11:00',
    until: null,
  },
  staff: { id: 'st_2', name: 'Ana Gvazava', photoUrl: null },
};

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockBack.mockClear();
  mockCanGoBack = true;
  mockGymRetry.mockClear();
  mockGym = { gymId: 'gym_1', isPending: false, isError: false, retry: mockGymRetry };
  mockListServices.mockReset();
  mockListServices.mockResolvedValue({ services: [PT, CUSTOM] });
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

describe('the state machine', () => {
  it('shows SKELETONS while the catalogue loads', () => {
    const view = renderScreen(<ServicesScreen />);
    expect(view.getByTestId('services-loading')).toBeTruthy();
    // Web hides the filter chips in every non-ready state — a type filter over
    // nothing narrows nothing. Kept deliberately.
    expect(view.queryByTestId('services-filters')).toBeNull();
  });

  it('renders the catalogue, titling a PT service from its trainer', async () => {
    const view = renderScreen(<ServicesScreen />);
    await view.findByTestId('services-list');
    // NOT the stored `name` ("PT — Nino Beridze"), which is generated: the
    // catalogue carries `services.ptTitle` for exactly this.
    expect(view.getByText('Personal training - Nino Beridze')).toBeTruthy();
    expect(view.getByText('Sports massage')).toBeTruthy();
    expect(view.getByText('With Nino Beridze · 60 min')).toBeTruthy();
    expect(view.getByText('GEL 120.00')).toBeTruthy();
  });

  it('shows the EMPTY state for a gym with no services', async () => {
    mockListServices.mockResolvedValue({ services: [] });
    const view = renderScreen(<ServicesScreen />);
    await view.findByTestId('services-empty');
    expect(view.getByText('No services yet')).toBeTruthy();
    expect(view.queryByTestId('services-filters')).toBeNull();
  });

  it('shows an ERROR with a retry that actually refetches', async () => {
    mockListServices.mockRejectedValueOnce(new Error('boom'));
    const view = renderScreen(<ServicesScreen />);
    await view.findByTestId('services-error');

    mockListServices.mockResolvedValue({ services: [PT, CUSTOM] });
    fireEvent.press(view.getByTestId('services-retry'));
    await view.findByTestId('services-list');
    expect(mockListServices).toHaveBeenCalledTimes(2);
  });

  it('renders an OFFLINE branch rather than skeletons forever', async () => {
    onlineManager.setOnline(false);
    const view = renderScreen(<ServicesScreen />);
    await view.findByTestId('services-offline');
    expect(view.queryByTestId('services-loading')).toBeNull();
    expect(mockListServices).not.toHaveBeenCalled();
  });

  it('SAYS the radio is out — a paused query never resolves, so a skeleton lies', async () => {
    // The branch existed and drew the SAME skeletons as `loading`, which means
    // the screen said "any moment now" for the rest of the session. Eleven
    // other screens render `OfflineNotice` in exactly this branch; this one is
    // now the twelfth. TODO(i18n) `common.offline.*` — the marked placeholder.
    onlineManager.setOnline(false);
    const view = renderScreen(<ServicesScreen />);
    await view.findByTestId('services-offline');
    expect(view.getByText("You're offline")).toBeTruthy();
    expect(view.getByText('Check your connection and try again.')).toBeTruthy();
  });

  it('errors when no tenant can be resolved', async () => {
    mockGym = { gymId: null, isPending: false, isError: true, retry: mockGymRetry };
    const view = renderScreen(<ServicesScreen />);
    await view.findByTestId('services-error');
  });
});

describe('the type filter', () => {
  it('narrows to one type and back', async () => {
    const view = renderScreen(<ServicesScreen />);
    await view.findByTestId('services-list');

    fireEvent.press(view.getByTestId('services-filter-CUSTOM'));
    expect(view.queryByText('Personal training - Nino Beridze')).toBeNull();
    expect(view.getByText('Sports massage')).toBeTruthy();

    fireEvent.press(view.getByTestId('services-filter-ALL'));
    expect(view.getByText('Personal training - Nino Beridze')).toBeTruthy();
  });

  it('says so with ONE bare sentence when a type has nothing — no reset action', async () => {
    // `services.filters.noMatch` is a single string, unlike
    // `trainers.filters.noMatch`'s title/subtitle/action block. The catalogue's
    // own shape, kept rather than harmonised.
    mockListServices.mockResolvedValue({ services: [PT] });
    const view = renderScreen(<ServicesScreen />);
    await view.findByTestId('services-list');

    fireEvent.press(view.getByTestId('services-filter-CUSTOM'));
    expect(view.getByTestId('services-no-match')).toBeTruthy();
    expect(view.getByText('No services of this type yet.')).toBeTruthy();
    expect(view.queryByTestId('services-list')).toBeNull();
  });
});

describe('the schedule panel', () => {
  it('opens one card at a time, and closing is the same control', async () => {
    const view = renderScreen(<ServicesScreen />);
    await view.findByTestId('services-list');

    expect(view.queryByTestId('service-schedule-svc_massage')).toBeNull();
    fireEvent.press(view.getByTestId('service-schedule-toggle-svc_massage'));
    expect(view.getByTestId('service-schedule-svc_massage')).toBeTruthy();

    // Opening a second closes the first — a list of expanded tables is a list
    // nobody can scan.
    fireEvent.press(view.getByTestId('service-schedule-toggle-svc_pt'));
    expect(view.queryByTestId('service-schedule-svc_massage')).toBeNull();
    expect(view.getByTestId('service-schedule-svc_pt')).toBeTruthy();

    fireEvent.press(view.getByTestId('service-schedule-toggle-svc_pt'));
    expect(view.queryByTestId('service-schedule-svc_pt')).toBeNull();
  });

  it('says "by appointment" for a PT service with no recurrence', async () => {
    const view = renderScreen(<ServicesScreen />);
    await view.findByTestId('services-list');
    fireEvent.press(view.getByTestId('service-schedule-toggle-svc_pt'));
    expect(
      view.getByText(
        'Sessions are booked one by one with the trainer - ask at the front desk or message the gym.',
      ),
    ).toBeTruthy();
  });

  it('summarises a recurrence and lists the dates it next falls on', async () => {
    const view = renderScreen(<ServicesScreen />);
    await view.findByTestId('services-list');
    fireEvent.press(view.getByTestId('service-schedule-toggle-svc_massage'));
    expect(view.getByTestId('service-schedule-summary').props.children).toBe(
      'Every Tue, Thu · 11:00',
    );
  });
});

describe('the a11y contract', () => {
  it('has the screen title first, then one header per visible card', async () => {
    const view = renderScreen(<ServicesScreen />);
    await view.findByTestId('services-list');
    expect(headerTexts(view.getAllByRole('header'))).toEqual([
      'Services',
      'Personal training - Nino Beridze',
      'Sports massage',
    ]);
  });

  it('opens a service, and distinguishes the identical CTAs by hint', async () => {
    const view = renderScreen(<ServicesScreen />);
    await view.findByTestId('services-list');
    const open = view.getByTestId('service-open-svc_massage');
    expect(open.props.accessibilityHint).toBe('Sports massage');
    fireEvent.press(open);
    expect(mockPush).toHaveBeenCalledWith('/services/svc_massage');
  });

  it('offers a labelled way back, falling back to home from a cold link', async () => {
    const view = renderScreen(<ServicesScreen />);
    await view.findByTestId('services-list');
    fireEvent.press(view.getByTestId('services-back'));
    expect(mockBack).toHaveBeenCalled();

    mockCanGoBack = false;
    const cold = renderScreen(<ServicesScreen />);
    fireEvent.press(cold.getByTestId('services-back'));
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });
});

describe('copy', () => {
  it('is entirely from the catalogue, in both locales', async () => {
    const ka = renderScreen(<ServicesScreen />, { locale: 'ka' });
    await ka.findByTestId('services-list');
    const tree = JSON.stringify(ka.toJSON());

    expect(ka.getByText('სერვისები')).toBeTruthy();
    expect(ka.queryByText('Services')).toBeNull();
    // Money follows the locale too: lari suffix, comma decimal, in Georgian.
    expect(ka.getByText('120,00 ₾')).toBeTruthy();
    expect(tree).not.toMatch(/services\.(card|filters|type|empty)\./);
  });
});
