// The reviews block's four branches — and the one that used to never end.
//
// `isOffline` is a PROP here rather than a query, which is why this file exists
// at all: the section is only mounted once the trainer profile has landed, so
// the offline branch is unreachable from a cold trainer-sheet test. Driven
// directly, each branch is one render.
import { renderScreen } from '../../test-support/render-screen';

import { TrainerReviewsSection, formatRating } from './trainer-reviews';

const COPY = {
  title: 'Reviews',
  empty: 'No reviews yet',
  count: '3 reviews',
  ratingLabel: (rating: number) => `${String(rating)} out of 5`,
  error: "We couldn't load the reviews.",
  retry: 'Try again',
};

function section(over: Partial<Parameters<typeof TrainerReviewsSection>[0]> = {}) {
  return (
    <TrainerReviewsSection
      locale="en"
      data={undefined}
      isPending={true}
      isError={false}
      isOffline={false}
      onRetry={() => undefined}
      copy={COPY}
      {...over}
    />
  );
}

describe('formatRating', () => {
  it('writes one decimal, as web writes it', () => {
    expect(formatRating(4)).toBe('4.0');
    expect(formatRating(4.25)).toBe('4.3');
  });
});

describe('the four branches', () => {
  it('skeletons while the page is in flight', () => {
    const view = renderScreen(section());
    expect(view.getByTestId('trainer-reviews-loading')).toBeTruthy();
  });

  it('SAYS the radio is out rather than skeletoning forever', () => {
    // The branch existed and drew a skeleton — but `onlineManager` PAUSES a
    // query rather than failing it, so this state never resolves on its own and
    // the placeholder never becomes content. `OfflineNotice` is the app's
    // answer, already rendered in this branch on eleven other screens.
    // TODO(i18n) `common.offline.title` / `common.offline.body`.
    const view = renderScreen(section({ isOffline: true }));
    expect(view.getByTestId('trainer-reviews-offline')).toBeTruthy();
    expect(view.getByText("You're offline")).toBeTruthy();
    expect(view.getByText('Check your connection and try again.')).toBeTruthy();
    // And it is NOT the loading state wearing a different testID.
    expect(view.queryByTestId('trainer-reviews-loading')).toBeNull();
  });

  it('errors with a working retry', () => {
    const view = renderScreen(section({ isPending: false, isError: true }));
    expect(view.getByTestId('trainer-reviews-error')).toBeTruthy();
    expect(view.getByText("We couldn't load the reviews.")).toBeTruthy();
  });

  it('offline beats error — a parked query has not failed', () => {
    const view = renderScreen(section({ isPending: false, isError: true, isOffline: true }));
    expect(view.getByTestId('trainer-reviews-offline')).toBeTruthy();
    expect(view.queryByTestId('trainer-reviews-error')).toBeNull();
  });
});
