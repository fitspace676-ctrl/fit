// The trainer sheet — the WHOLE profile, and the branches it inherited from
// the `/trainers/:id` screen it replaced (deleted 2026-09-09).
//
// This file is that screen's test suite, re-pointed at the sheet: the profile's
// four phases, the 404 that is a dead end rather than an error, the schedule's
// grouping and its one bookable slot, and the reviews that must be able to fail
// without taking the coach with them.
//
// HOW THE DATA IS FAKED, AND WHY IT IS NOT `useQuery` THAT IS MOCKED. Only the
// OPTIONS FACTORIES are swapped — the `queryFn` is a jest mock and everything
// else (the real `QueryClient`, the real `pending → error` machine, the real
// `onlineManager` pause) is left alone. Mocking `useQuery` itself would let a
// test assert a state the library can never actually produce.
import { useState } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, waitFor } from '@testing-library/react-native';
import type { ListTrainerReviewsResponse, TrainerDetail } from '@fit/types';

import { TrainerSheet } from './trainer-sheet';
import { ApiError } from '../../lib/http/api-error';
import { renderScreen } from '../../test-support/render-screen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// The sheet reads its own `online`, not `onlineManager` — the two are wired
// together in the app and separately here so a paused query and a dead radio
// can be driven independently.
let mockOnline = true;
jest.mock('../auth/use-online', () => ({ useIsOnline: () => mockOnline }));

const mockGetTrainer = jest.fn();
const mockListReviews = jest.fn();
jest.mock('../../hooks/queries/useTrainers', () => ({
  trainerQueryOptions: (gymId: string | null, trainerId: string | null | undefined) => ({
    queryKey: ['trainers', gymId ?? '', 'detail', trainerId ?? ''],
    queryFn: () => mockGetTrainer() as unknown,
    enabled: gymId !== null && Boolean(trainerId),
  }),
  trainerReviewsQueryOptions: (gymId: string | null, trainerId: string | null | undefined) => ({
    // The REAL factory appends a filter bucket after `reviews`; the mock keeps
    // it so the sheet's root-prefix invalidation is exercised for real.
    queryKey: ['trainers', gymId ?? '', 'detail', trainerId ?? '', 'reviews', null],
    queryFn: () => mockListReviews() as unknown,
    enabled: gymId !== null && Boolean(trainerId),
  }),
}));

/** A Thursday 18:00 and 19:30, in the DEVICE's zone — the day the sheet groups by. */
const CLASS_AT = new Date(2026, 7, 6, 18, 0).toISOString();
const CLASS_END = new Date(2026, 7, 6, 19, 0).toISOString();
const SLOT_AT = new Date(2026, 7, 6, 19, 30).toISOString();
const SLOT_END = new Date(2026, 7, 6, 20, 30).toISOString();

const TRAINER: TrainerDetail = {
  id: 't1',
  name: 'Nino Beridze',
  headline: 'Head coach',
  bio: 'Ten years on the floor.',
  avatarUrl: null,
  specialties: ['Spin', 'CrossFit'],
  locationNames: ['Main Floor', 'Studio 2'],
  schedule: [
    {
      id: 'occ_1',
      title: 'Morning Spin',
      startsAt: CLASS_AT,
      endsAt: CLASS_END,
      locationName: 'Main Floor',
      kind: 'CLASS',
      serviceId: null,
    },
    {
      id: 'occ_2',
      title: 'PT with Nino',
      startsAt: SLOT_AT,
      endsAt: SLOT_END,
      locationName: '',
      kind: 'SERVICE',
      serviceId: 'svc_9',
    },
  ],
};

const REVIEWS: ListTrainerReviewsResponse = {
  reviews: [
    {
      id: 'r1',
      rating: 5,
      comment: 'Excellent.',
      authorName: 'Ana G.',
      createdAt: '2026-07-02T10:00:00.000Z',
    },
  ],
  avgRating: 4.8,
  total: 23,
  page: 1,
  limit: 10,
};

/**
 * The `Sheet`'s exit is a real 220ms `setTimeout`, and a `waitFor` on the panel
 * unmounting has to outlast it on a loaded box. Same reasoning, same numbers as
 * `app/(tabs)/classes/[id].test.tsx`: the wait ceiling is generous and the test
 * ceiling is raised above it, so a slow run reports "still waiting" rather than
 * a broken-looking assertion.
 */
const WAIT = { timeout: 10_000 } as const;
jest.setTimeout(30_000);

const onClose = jest.fn();

/**
 * The sheet as a screen renders it: `trainerId` set, the caller's own
 * denormalised name and portrait already on screen.
 */
function sheet(over: Partial<Parameters<typeof TrainerSheet>[0]> = {}) {
  return (
    <TrainerSheet
      gymId="gym_1"
      trainerId="t1"
      name="Nino Beridze"
      avatarUrl={null}
      onClose={onClose}
      {...over}
    />
  );
}

beforeEach(() => {
  mockPush.mockClear();
  onClose.mockClear();
  mockOnline = true;
  mockGetTrainer.mockReset();
  mockListReviews.mockReset();
  mockGetTrainer.mockResolvedValue({ trainer: TRAINER });
  mockListReviews.mockResolvedValue(REVIEWS);
  onlineManager.setOnline(true);
});

afterEach(() => {
  // Leaking `false` into the next file would pause every query in it.
  onlineManager.setOnline(true);
});

describe('the profile', () => {
  it('shows skeletons first, then everything the deleted screen drew', async () => {
    const view = renderScreen(sheet());
    expect(view.getByTestId('class-trainer-sheet-loading')).toBeTruthy();

    // NOT `trainer-hero` — that is drawn from the caller's own name and face
    // from the first frame, under the request. The bio is the profile landing.
    await view.findByTestId('class-trainer-sheet-bio');
    expect(view.getByText('Head coach')).toBeTruthy();
    expect(view.getByText('Ten years on the floor.')).toBeTruthy();
    expect(view.getByText('Spin')).toBeTruthy();
    expect(view.getByText('Main Floor · Studio 2')).toBeTruthy();
    expect(view.getByTestId('trainer-schedule')).toBeTruthy();
    expect(view.getByTestId('trainer-reviews')).toBeTruthy();
  });

  it('is titled from the CALLER’s string, before the request lands', () => {
    const view = renderScreen(sheet({ name: 'Nino B.' }));
    // Not the profile's `name` — the member pressed a row that said this, and a
    // title that changes shape when the request answers reads as a new sheet.
    expect(view.getAllByText('Nino B.', { includeHiddenElements: true }).length).toBeGreaterThan(0);
  });

  it('makes no request at all until it has been opened for someone', () => {
    renderScreen(sheet({ trainerId: null }));
    expect(mockGetTrainer).not.toHaveBeenCalled();
    expect(mockListReviews).not.toHaveBeenCalled();
  });

  it('lands on NOT FOUND for a 404 — not on an error with a pointless retry', async () => {
    // A cross-tenant id and an unknown id are deliberately indistinguishable
    // server-side, so this is the same branch for both.
    mockGetTrainer.mockRejectedValue(new ApiError({ status: 404, code: 'NOT_FOUND' }));
    const view = renderScreen(sheet());
    await view.findByTestId('class-trainer-sheet-not-found');
    expect(view.getByText('Trainer not found')).toBeTruthy();
    expect(view.queryByTestId('class-trainer-sheet-retry')).toBeNull();
    // Nothing else is drawn over the top of it — not even the hero.
    expect(view.queryByTestId('trainer-hero')).toBeNull();

    // "Back to trainers" IS the close: the roster is behind the scrim.
    fireEvent.press(view.getByTestId('class-trainer-sheet-not-found-back'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an ERROR with a working retry for anything else', async () => {
    mockGetTrainer.mockRejectedValueOnce(new ApiError({ status: 503, code: 'UNAVAILABLE' }));
    const view = renderScreen(sheet());
    await view.findByTestId('class-trainer-sheet-error');
    // The coach's name and face are still there — the caller had them already.
    expect(view.getByTestId('trainer-hero')).toBeTruthy();

    mockGetTrainer.mockResolvedValue({ trainer: TRAINER });
    fireEvent.press(view.getByTestId('class-trainer-sheet-retry'));
    await view.findByTestId('class-trainer-sheet-bio');
    expect(mockGetTrainer).toHaveBeenCalledTimes(2);
  });

  it('is the ERROR branch with no tenant — there is nothing to wait for', async () => {
    const view = renderScreen(sheet({ gymId: null }));
    await view.findByTestId('class-trainer-sheet-error');
    expect(view.queryByTestId('class-trainer-sheet-loading')).toBeNull();
    expect(mockGetTrainer).not.toHaveBeenCalled();
  });

  it('SAYS the radio is out rather than drawing skeletons forever', async () => {
    mockOnline = false;
    onlineManager.setOnline(false);
    const view = renderScreen(sheet());
    await view.findByTestId('class-trainer-sheet-offline');
    expect(view.queryByTestId('class-trainer-sheet-loading')).toBeNull();
  });
});

describe('the schedule', () => {
  it('groups by day and offers Book only on a bookable SERVICE slot', async () => {
    const view = renderScreen(sheet());
    await view.findByTestId('trainer-schedule');

    expect(view.getByTestId('trainer-schedule-day-2026-08-06')).toBeTruthy();
    expect(view.getByText('Thu, Aug 6')).toBeTruthy();
    // `en` is CLDR's `h:mm a`, so this is the English clock, not the Georgian
    // one — see `formatTime`.
    expect(view.getByText('6:00 PM – 7:00 PM')).toBeTruthy();
    expect(view.getByText('Morning Spin')).toBeTruthy();

    // A CLASS occurrence has nothing to book here; a SERVICE slot does.
    expect(view.queryByTestId('trainer-schedule-book-occ_1')).toBeNull();
    fireEvent.press(view.getByTestId('trainer-schedule-book-occ_2'));
    // Closed BEFORE the push: a sheet left open behind a navigation is still
    // there when the member comes back, over a screen they have left.
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/services/svc_9');
  });

  it('says so when there is nothing coming up, without dropping the heading', async () => {
    mockGetTrainer.mockResolvedValue({ trainer: { ...TRAINER, schedule: [] } });
    const view = renderScreen(sheet());
    await view.findByTestId('trainer-schedule-empty');
    expect(view.getByText('Upcoming sessions')).toBeTruthy();
  });
});

describe('the reviews load independently of the profile', () => {
  it('renders the aggregate, the page and the hero’s rating', async () => {
    const view = renderScreen(sheet());
    await view.findByTestId('trainer-reviews-list');
    // Twice on purpose: the hero pill and the reviews summary, one number.
    expect(view.getAllByText('4.8')).toHaveLength(2);
    expect(view.getByText('23 reviews')).toBeTruthy();
    expect(view.getByText('Excellent.')).toBeTruthy();
    expect(view.getByText('Ana G.')).toBeTruthy();
    // The stars are ONE node with the whole sentence, not five.
    expect(view.getAllByLabelText('4.8 out of 5 stars').length).toBeGreaterThan(0);
  });

  it('KEEPS THE PROFILE when the reviews fail, and retries only them', async () => {
    // The regression this exists for: web swallows a reviews failure into
    // `{reviews: [], total: 0}` and renders "No reviews yet", which is a lie.
    mockListReviews.mockRejectedValueOnce(new ApiError({ status: 500, code: 'INTERNAL' }));
    const view = renderScreen(sheet());
    await view.findByTestId('trainer-reviews-error');

    expect(view.getByTestId('trainer-hero')).toBeTruthy();
    expect(view.getByText('Ten years on the floor.')).toBeTruthy();
    expect(view.queryByTestId('class-trainer-sheet-error')).toBeNull();
    expect(view.queryByTestId('trainer-reviews-empty')).toBeNull();

    mockListReviews.mockResolvedValue(REVIEWS);
    fireEvent.press(view.getByTestId('trainer-reviews-retry'));
    await view.findByTestId('trainer-reviews-list');
    expect(mockListReviews).toHaveBeenCalledTimes(2);
    // The profile was never refetched — the retry is scoped to the section.
    expect(mockGetTrainer).toHaveBeenCalledTimes(1);
  });

  it('keys its empty state on `total`, not on the page length', async () => {
    mockListReviews.mockResolvedValue({ ...REVIEWS, reviews: [], avgRating: 0, total: 0 });
    const view = renderScreen(sheet());
    await view.findByTestId('trainer-reviews-empty');
    expect(view.queryByTestId('trainer-rating')).toBeNull();
  });
});

describe('the sheet itself', () => {
  it('keeps rendering while it closes, so the exit has a panel to run against', async () => {
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <TrainerSheet
            gymId="gym_1"
            trainerId={open ? 't1' : null}
            name="Nino Beridze"
            avatarUrl={null}
            onClose={() => {
              setOpen(false);
            }}
          />
        </>
      );
    }
    const view = renderScreen(<Host />);
    await view.findByTestId('trainer-hero');

    fireEvent.press(view.getByTestId('class-trainer-sheet-close'));
    // `Sheet` unmounts its `Modal` only after the 220ms exit; the panel is
    // still there on the frame `trainerId` cleared.
    expect(view.getByTestId('class-trainer-sheet')).toBeTruthy();
    await waitFor(() => {
      expect(view.queryByTestId('class-trainer-sheet')).toBeNull();
    }, WAIT);
  });
});

describe('copy', () => {
  it('is entirely from the catalogue, in both locales', async () => {
    const ka = renderScreen(sheet(), { locale: 'ka' });
    await ka.findByTestId('trainer-reviews-list');
    const tree = JSON.stringify(ka.toJSON());

    // One key from each of the two families the sheet draws from (D10).
    expect(ka.getByText('სპეციალიზაციები')).toBeTruthy();
    expect(ka.getByText('შეფასებები')).toBeTruthy();
    expect(ka.queryByText('Reviews')).toBeNull();
    expect(ka.queryByText('Specialties')).toBeNull();
    // A key that resolved to nothing would render its own dot-path.
    expect(tree).not.toMatch(/member\.trainers\./);
    expect(tree).not.toMatch(/trainers\.detail\./);
    expect(tree).not.toMatch(/classes\.modal\./);
  });
});
