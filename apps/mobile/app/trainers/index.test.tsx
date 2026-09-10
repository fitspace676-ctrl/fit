// `/trainers` — every branch of plan §6's definition of done.
//
// HOW THE DATA IS FAKED, AND WHY IT IS NOT `useQuery` THAT IS MOCKED.
//
// The module under mock is `hooks/queries/useTrainers`, and only its OPTIONS
// FACTORY — the `queryFn` is swapped for a jest mock and everything else (the
// real `QueryClient`, the real `pending → error` machine, the real
// `onlineManager` pause) is left alone. Mocking `useQuery` itself would let a
// test assert a state the library can never actually produce, which is how a
// screen ends up correct against a fiction. In particular the OFFLINE branch
// here is a genuine paused query, driven by `onlineManager.setOnline(false)`,
// not a hand-set `fetchStatus`.
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, waitFor } from '@testing-library/react-native';
import type { TrainerCard } from '@fit/types';

import TrainersScreen from './index';
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

const mockListTrainers = jest.fn();
// The sheet a row opens reads the FULL profile and its reviews — two further
// requests, made only once a row has been pressed. Every branch of the sheet
// itself is `components/classes/trainer-sheet.test.tsx`'s; this file only needs
// them to resolve, so a row press can be followed all the way to the panel.
const mockGetTrainer = jest.fn();
const mockListReviews = jest.fn();
jest.mock('../../hooks/queries/useTrainers', () => ({
  trainersQueryOptions: (gymId: string | null) => ({
    queryKey: ['trainers', gymId ?? ''],
    queryFn: () => mockListTrainers() as unknown,
    enabled: gymId !== null,
  }),
  trainerQueryOptions: (gymId: string | null, trainerId: string | null | undefined) => ({
    queryKey: ['trainers', gymId ?? '', 'detail', trainerId ?? ''],
    queryFn: () => mockGetTrainer() as unknown,
    enabled: gymId !== null && Boolean(trainerId),
  }),
  trainerReviewsQueryOptions: (gymId: string | null, trainerId: string | null | undefined) => ({
    queryKey: ['trainers', gymId ?? '', 'detail', trainerId ?? '', 'reviews', null],
    queryFn: () => mockListReviews() as unknown,
    enabled: gymId !== null && Boolean(trainerId),
  }),
}));

function trainer(overrides: Partial<TrainerCard> & { id: string; name: string }): TrainerCard {
  return {
    headline: '',
    bio: '',
    avatarUrl: null,
    specialties: [],
    locationNames: [],
    ...overrides,
  };
}

const ROSTER: TrainerCard[] = [
  trainer({
    id: 't1',
    name: 'Nino Beridze',
    headline: 'Head coach',
    specialties: ['Spin'],
    locationNames: ['Main Floor'],
  }),
  trainer({ id: 't2', name: 'Sandro Kapanadze', specialties: ['Yoga'] }),
];

/**
 * The `Sheet`'s exit is a real 220ms `setTimeout`, and a `waitFor` on the panel
 * unmounting has to outlast it on a loaded box — see `components/classes/
 * trainer-sheet.test.tsx` for the same pair of numbers and the same reasoning.
 */
const SHEET_EXIT = { timeout: 10_000 } as const;
jest.setTimeout(30_000);

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockBack.mockClear();
  mockCanGoBack = true;
  mockGymRetry.mockClear();
  mockGym = { gymId: 'gym_1', isPending: false, isError: false, retry: mockGymRetry };
  mockListTrainers.mockReset();
  mockListTrainers.mockResolvedValue({ trainers: ROSTER });
  mockGetTrainer.mockReset();
  mockGetTrainer.mockResolvedValue({
    trainer: { ...ROSTER[0], bio: 'Ten years on the floor.', schedule: [] },
  });
  mockListReviews.mockReset();
  mockListReviews.mockResolvedValue({
    reviews: [],
    avgRating: 0,
    total: 0,
    page: 1,
    limit: 10,
  });
  onlineManager.setOnline(true);
});

afterEach(() => {
  // Leaking `false` into the next file would pause every query in it.
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

describe('the four states web ships, plus the two a phone has', () => {
  it('shows SKELETONS while the roster loads — never a bare spinner', () => {
    const { getByTestId, queryByTestId } = renderScreen(<TrainersScreen />);
    expect(getByTestId('trainers-loading')).toBeTruthy();
    expect(queryByTestId('trainers-list')).toBeNull();
  });

  it('renders the roster', async () => {
    const { findByTestId, getByText } = renderScreen(<TrainersScreen />);
    await findByTestId('trainers-list');
    expect(getByText('Nino Beridze')).toBeTruthy();
    expect(getByText('Sandro Kapanadze')).toBeTruthy();
    expect(getByText('Head coach')).toBeTruthy();
    expect(getByText('Spin · Main Floor')).toBeTruthy();
  });

  it('shows the EMPTY state for a gym with no trainers', async () => {
    mockListTrainers.mockResolvedValue({ trainers: [] });
    const { findByTestId, getByText, queryByTestId } = renderScreen(<TrainersScreen />);
    await findByTestId('trainers-empty');
    expect(getByText('No trainers yet')).toBeTruthy();
    // No filter bar over a roster that does not exist.
    expect(queryByTestId('trainers-filters')).toBeNull();
  });

  it('shows an ERROR with a retry that actually refetches', async () => {
    mockListTrainers.mockRejectedValueOnce(new Error('boom'));
    const { findByTestId, getByText, getByTestId } = renderScreen(<TrainersScreen />);
    await findByTestId('trainers-error');
    expect(getByText('We couldn’t load the trainers. Please try again.')).toBeTruthy();

    mockListTrainers.mockResolvedValue({ trainers: ROSTER });
    fireEvent.press(getByTestId('trainers-retry'));

    await findByTestId('trainers-list');
    expect(mockListTrainers).toHaveBeenCalledTimes(2);
  });

  it('renders an OFFLINE branch rather than skeletons forever', async () => {
    // `onlineManager` parks the query (`fetchStatus: 'paused'`, `isError:
    // false`), so without this branch the screen sits on its loading state and
    // never says anything. TODO(i18n): there is no `offline` copy anywhere in
    // either catalogue, so the branch is structural — see the screen.
    onlineManager.setOnline(false);
    const { getByTestId, queryByTestId } = renderScreen(<TrainersScreen />);
    await waitFor(() => {
      expect(getByTestId('trainers-offline')).toBeTruthy();
    });
    expect(queryByTestId('trainers-loading')).toBeNull();
    expect(mockListTrainers).not.toHaveBeenCalled();
  });

  it('SAYS the radio is out rather than drawing the loading state again', async () => {
    // The branch was distinct and testable and drew the SAME skeletons as
    // `loading` — so on screen there was no difference between "any moment now"
    // and "never". TODO(i18n) `common.offline.*` — the marked placeholder every
    // other screen in the app already renders here.
    onlineManager.setOnline(false);
    const { getByText, findByTestId } = renderScreen(<TrainersScreen />);
    await findByTestId('trainers-offline');
    expect(getByText("You're offline")).toBeTruthy();
    expect(getByText('Check your connection and try again.')).toBeTruthy();
  });

  it('waits while the public tenant lookup is still resolving', () => {
    mockGym = { gymId: null, isPending: true, isError: false, retry: mockGymRetry };
    const { getByTestId } = renderScreen(<TrainersScreen />);
    expect(getByTestId('trainers-loading')).toBeTruthy();
  });

  it('errors when no tenant can be resolved at all', async () => {
    mockGym = { gymId: null, isPending: false, isError: true, retry: mockGymRetry };
    const { findByTestId } = renderScreen(<TrainersScreen />);
    await findByTestId('trainers-error');
  });
});

describe('the filters', () => {
  it('narrows by name and offers a distinct NO-MATCH state with a reset', async () => {
    const { findByTestId, getByTestId, getByText, queryByTestId } = renderScreen(
      <TrainersScreen />,
    );
    await findByTestId('trainers-list');

    fireEvent.changeText(getByTestId('trainers-search'), 'zzz');
    expect(getByTestId('trainers-no-match')).toBeTruthy();
    // NOT the "no trainers yet" empty state: the roster exists, the filter
    // excludes it. The old app conflated the two.
    expect(queryByTestId('trainers-empty')).toBeNull();
    expect(getByText('No trainers match')).toBeTruthy();

    fireEvent.press(getByTestId('trainers-clear-filters'));
    expect(getByTestId('trainers-list')).toBeTruthy();
  });

  it('clears the search from the field s own button', async () => {
    const { findByTestId, getByTestId, queryByTestId } = renderScreen(<TrainersScreen />);
    await findByTestId('trainers-list');

    // The clear button appears only once there is something to clear.
    expect(queryByTestId('trainers-search-clear')).toBeNull();
    fireEvent.changeText(getByTestId('trainers-search'), 'nino');
    fireEvent.press(getByTestId('trainers-search-clear'));
    expect(getByTestId('trainers-list')).toBeTruthy();
    expect(queryByTestId('trainers-search-clear')).toBeNull();
  });

  it('filters by specialty chip, and "All" resets', async () => {
    const { findByTestId, getByTestId, queryByText } = renderScreen(<TrainersScreen />);
    await findByTestId('trainers-list');

    fireEvent.press(getByTestId('trainers-specialty-Yoga'));
    expect(queryByText('Nino Beridze')).toBeNull();
    expect(queryByText('Sandro Kapanadze')).toBeTruthy();

    fireEvent.press(getByTestId('trainers-specialty-all'));
    expect(queryByText('Nino Beridze')).toBeTruthy();
  });
});

describe('the a11y contract', () => {
  it('has exactly one header, and it is the screen title', async () => {
    const { findByTestId, getAllByRole } = renderScreen(<TrainersScreen />);
    await findByTestId('trainers-list');
    // Per plan §6 as amended: assert the ORDERED LIST of headers, which catches
    // both a missing screen title and a stray heading.
    expect(headerTexts(getAllByRole('header'))).toEqual(['Trainers']);
  });

  it('names the roster count for a screen reader', async () => {
    const { findByTestId, getByLabelText } = renderScreen(<TrainersScreen />);
    await findByTestId('trainers-list');
    // The pill shows "2"; the label says what 2 counts. TODO(i18n): a real
    // `member.trainers.count` plural is owed — see the screen.
    expect(getByLabelText('2 Trainers')).toBeTruthy();
  });

  it("labels each row's only control with the trainer it opens", async () => {
    const { findByTestId, getByLabelText } = renderScreen(<TrainersScreen />);
    await findByTestId('trainers-list');
    fireEvent.press(getByLabelText('Nino Beridze'));
    await findByTestId('trainer-sheet');
  });
});

// ============================================================================
// A ROW OPENS THE SHEET, NOT A ROUTE (2026-09-09).
//
// `/trainers/:id` is deleted; the whole profile is the sheet. The roster's job
// is therefore to open ONE of them, hand it the pressed card so the panel is
// titled before the request lands, and keep the list underneath.
// ============================================================================
describe('the profile sheet', () => {
  it('opens on the pressed trainer, titled from the card the member tapped', async () => {
    const view = renderScreen(<TrainersScreen />);
    await view.findByTestId('trainers-list');

    fireEvent.press(view.getByTestId('trainer-open-t2'));
    await view.findByTestId('trainer-sheet');

    // The card's own name is the title, drawn before `GET /trainers/:id`
    // answers — the row had it on screen already.
    expect(
      view.getAllByText('Sandro Kapanadze', { includeHiddenElements: true }).length,
    ).toBeGreaterThan(1);
    // …and nothing was pushed: the roster is still behind the scrim.
    expect(mockPush).not.toHaveBeenCalled();
    expect(view.getByTestId('trainers-list')).toBeTruthy();
  });

  it('makes no trainer request until a row has actually been pressed', async () => {
    const view = renderScreen(<TrainersScreen />);
    await view.findByTestId('trainers-list');
    expect(view.queryByTestId('trainer-sheet')).toBeNull();
    expect(mockGetTrainer).not.toHaveBeenCalled();
    expect(mockListReviews).not.toHaveBeenCalled();
  });

  it('closes to the roster, and can be opened again on someone else', async () => {
    const view = renderScreen(<TrainersScreen />);
    await view.findByTestId('trainers-list');

    fireEvent.press(view.getByTestId('trainer-open-t1'));
    await view.findByTestId('trainer-sheet');
    fireEvent.press(view.getByTestId('trainer-sheet-close'));
    await waitFor(() => {
      expect(view.queryByTestId('trainer-sheet')).toBeNull();
    }, SHEET_EXIT);

    fireEvent.press(view.getByTestId('trainer-open-t2'));
    await view.findByTestId('trainer-sheet');
  });
});

describe('the rest of the a11y contract', () => {
  it('offers a labelled way back, and falls back to home from a cold link', async () => {
    const { findByTestId, getByTestId } = renderScreen(<TrainersScreen />);
    await findByTestId('trainers-list');
    fireEvent.press(getByTestId('trainers-back'));
    expect(mockBack).toHaveBeenCalled();

    mockCanGoBack = false;
    const cold = renderScreen(<TrainersScreen />);
    fireEvent.press(cold.getByTestId('trainers-back'));
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });
});

describe('copy', () => {
  it('is entirely from the catalogue, in both locales', async () => {
    const ka = renderScreen(<TrainersScreen />, { locale: 'ka' });
    await ka.findByTestId('trainers-list');
    const tree = JSON.stringify(ka.toJSON());

    // The Georgian strings really render…
    expect(ka.getByText('მწვრთნელები')).toBeTruthy();
    expect(ka.getByText('გაიცანი გუნდი')).toBeTruthy();
    // …no English is baked in…
    expect(ka.queryByText('Trainers')).toBeNull();
    // …and no raw key leaked onto the glass.
    expect(tree).not.toMatch(/member\.trainers\./);
    expect(tree).not.toMatch(/trainers\.grid\./);
  });
});
