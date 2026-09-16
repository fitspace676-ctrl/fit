// The review composer — the request it builds, and the two refusals it meets.
//
// The 409 branch is the one worth reading. `ALREADY_REVIEWED` is not an error
// the member can act on: pressing Post again can never work, and no
// member-reachable route could have told the app in advance (see
// `review-form.ts`). So it is handled as a STATE — the sheet reports the
// occurrence as reviewed and closes — rather than as a message left over a
// form with nowhere to go.
//
// `renderApp`, not `renderScreen`: the composer calls `useToast`.
import { fireEvent, waitFor } from '@testing-library/react-native';

import { ReviewSheet } from './review-sheet';
import { renderApp } from '../../test-support/render';
import { ApiError } from '../../lib/http/api-error';

jest.setTimeout(30_000);
const WAIT = { timeout: 10_000 };

jest.mock('../../hooks/useActiveGym', () => ({
  useGymId: () => 'gym_1',
  useActiveGym: () => ({ gymId: 'gym_1', role: 'MEMBER', userId: 'user_1' }),
}));

const mockCreateReview = jest.fn();
jest.mock('../../lib/api/reviews', () => ({
  createReview: (input: unknown) => mockCreateReview(input) as unknown,
  listTrainerReviews: () =>
    Promise.resolve({ reviews: [], avgRating: 0, total: 0, page: 1, limit: 10 }),
}));

const TARGET = { classInstanceId: 'ci_1', title: 'Morning Spin', when: 'Mon · 07:00' };

// A rendered node's `props` comes back untyped, so reading an accessibility
// field off it straight into an assertion is an `any` walk. These two name the
// only shapes this file reads.
const a11yDisabled = (node: { props: Record<string, unknown> }): boolean | undefined =>
  (node.props.accessibilityState as { disabled?: boolean } | undefined)?.disabled;

const a11yValueText = (node: { props: Record<string, unknown> }): string | undefined =>
  (node.props.accessibilityValue as { text?: string } | undefined)?.text;

function mount(overrides: Partial<React.ComponentProps<typeof ReviewSheet>> = {}) {
  const onClose = jest.fn();
  const onReviewed = jest.fn();
  const view = renderApp(
    <ReviewSheet open target={TARGET} onClose={onClose} onReviewed={onReviewed} {...overrides} />,
  );
  return { ...view, onClose, onReviewed };
}

beforeEach(() => {
  mockCreateReview.mockReset();
  mockCreateReview.mockResolvedValue({ id: 'rev_1' });
});

// ===========================================================================
// The request.
// ===========================================================================
describe('posting', () => {
  it('sends the occurrence and the rating, and omits a blank comment', async () => {
    const { findByTestId, getByTestId, onReviewed, onClose } = mount();

    fireEvent.press(await findByTestId('review-sheet-rating-4', {}, WAIT));
    fireEvent.press(getByTestId('review-sheet-submit'));

    await waitFor(() => {
      expect(mockCreateReview).toHaveBeenCalledTimes(1);
    }, WAIT);
    // No `trainerId` on the wire — it is derived server-side from the
    // occurrence — and no empty `comment` key.
    expect(mockCreateReview).toHaveBeenCalledWith({ classInstanceId: 'ci_1', rating: 4 });

    await waitFor(() => {
      expect(onReviewed).toHaveBeenCalledWith('ci_1');
    }, WAIT);
    expect(onClose).toHaveBeenCalled();
  });

  it('sends a trimmed comment when there is one', async () => {
    const { findByTestId, getByTestId } = mount();

    fireEvent.press(await findByTestId('review-sheet-rating-5', {}, WAIT));
    fireEvent.changeText(getByTestId('review-sheet-comment-input'), '  ძალიან კარგი  ');
    fireEvent.press(getByTestId('review-sheet-submit'));

    await waitFor(() => {
      expect(mockCreateReview).toHaveBeenCalledWith({
        classInstanceId: 'ci_1',
        rating: 5,
        comment: 'ძალიან კარგი',
      });
    }, WAIT);
  });

  it('refuses to post without a rating, and says so — the button stays live', async () => {
    const { findByTestId, getByTestId } = mount();
    await findByTestId('review-sheet-submit', {}, WAIT);

    // A disabled button swallows its own press and can never explain itself,
    // so the handler RUNS and turns the explanation on.
    expect(a11yDisabled(getByTestId('review-sheet-submit'))).toBe(false);
    fireEvent.press(getByTestId('review-sheet-submit'));

    await findByTestId('review-sheet-note', {}, WAIT);
    expect(mockCreateReview).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// The two refusals, by `code`.
// ===========================================================================
describe('a refused review', () => {
  it('treats 409 ALREADY_REVIEWED as a state: mark the row, close the form', async () => {
    mockCreateReview.mockRejectedValue(new ApiError({ status: 409, code: 'ALREADY_REVIEWED' }));
    const { findByTestId, getByTestId, onReviewed, onClose } = mount();

    fireEvent.press(await findByTestId('review-sheet-rating-3', {}, WAIT));
    fireEvent.press(getByTestId('review-sheet-submit'));

    await waitFor(() => {
      expect(onReviewed).toHaveBeenCalledWith('ci_1');
    }, WAIT);
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the draft on 403 NOT_ATTENDED — the row is what was wrong, not the text', async () => {
    mockCreateReview.mockRejectedValue(new ApiError({ status: 403, code: 'NOT_ATTENDED' }));
    const { findByTestId, getByTestId, findByText, onReviewed, onClose } = mount();

    fireEvent.press(await findByTestId('review-sheet-rating-2', {}, WAIT));
    fireEvent.changeText(getByTestId('review-sheet-comment-input'), 'კარგი');
    fireEvent.press(getByTestId('review-sheet-submit'));

    await findByText('You aren’t marked as attended for this class.', {}, WAIT);
    expect(onReviewed).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(getByTestId('review-sheet-comment-input').props.value).toBe('კარგი');
  });

  it('falls back to one sentence for a 5xx', async () => {
    mockCreateReview.mockRejectedValue(new ApiError({ status: 500, code: 'INTERNAL_ERROR' }));
    const { findByTestId, getByTestId, findByText } = mount();

    fireEvent.press(await findByTestId('review-sheet-rating-1', {}, WAIT));
    fireEvent.press(getByTestId('review-sheet-submit'));

    await findByText('Something went wrong', {}, WAIT);
  });
});

// ===========================================================================
// The a11y contract of the one control that has no text.
// ===========================================================================
describe('the rating control', () => {
  it('speaks a value rather than five anonymous glyphs', async () => {
    const { findByTestId } = mount();
    const control = await findByTestId('review-sheet-rating', {}, WAIT);

    expect(control.props.accessibilityRole).toBe('adjustable');
    expect(control.props.accessibilityLabel).toBe('Your rating');
    expect(a11yValueText(control)).toBe('No rating chosen yet');
  });

  it('announces the chosen rating as a sentence, not as a percentage', async () => {
    const { findByTestId, getByTestId } = mount();
    fireEvent.press(await findByTestId('review-sheet-rating-4', {}, WAIT));
    expect(a11yValueText(getByTestId('review-sheet-rating'))).toBe('4 out of 5 stars');
  });

  it('names every star, in the locale, with the right plural', async () => {
    const { findByTestId, getByTestId } = mount();
    await findByTestId('review-sheet-rating', {}, WAIT);
    expect(getByTestId('review-sheet-rating-1').props.accessibilityLabel).toBe('1 star');
    expect(getByTestId('review-sheet-rating-3').props.accessibilityLabel).toBe('3 stars');
  });
});

// ===========================================================================
// Copy: both locales, no English baked in. §6 item 6.
// ===========================================================================
describe('copy', () => {
  it('renders Georgian, and it is not the English string', async () => {
    const onClose = jest.fn();
    const onReviewed = jest.fn();
    const ka = renderApp(
      <ReviewSheet open target={TARGET} onClose={onClose} onReviewed={onReviewed} />,
      { locale: 'ka' },
    );
    const control = await ka.findByTestId('review-sheet-rating', {}, WAIT);
    expect(control.props.accessibilityLabel).toBe('შენი შეფასება');
    expect(a11yValueText(control)).toBe('შეფასება ჯერ არ არის არჩეული');
    expect(ka.getByTestId('review-sheet-rating-3').props.accessibilityLabel).toBe('3 ვარსკვლავი');
  });
});

// ===========================================================================
// No target, no composer.
// ===========================================================================
describe('with nothing to review', () => {
  it('renders nothing at all', () => {
    const { queryByTestId } = mount({ target: null });
    expect(queryByTestId('review-sheet')).toBeNull();
  });
});
