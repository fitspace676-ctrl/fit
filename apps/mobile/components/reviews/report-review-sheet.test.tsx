import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderScreen } from '../../test-support/render-screen';
import { ReportReviewSheet } from './report-review-sheet';

const mockReport = jest.fn();
jest.mock('../../lib/api/reviews', () => ({
  reportReview: (...args: unknown[]) => mockReport(...args) as unknown,
}));
beforeEach(() => {
  mockReport.mockReset();
  mockReport.mockResolvedValue({ reported: true });
});

it('submits a reason and trimmed note, hides the row only on success, and confirms club review', async () => {
  const onReported = jest.fn();
  const view = renderScreen(
    <ReportReviewSheet reviewId="r1" onClose={jest.fn()} onReported={onReported} />,
  );
  fireEvent.press(view.getByTestId('report-reason-SPAM'));
  fireEvent.changeText(view.getByTestId('report-note-input'), '  Ad  ');
  fireEvent.press(view.getByTestId('report-submit'));
  await waitFor(() =>
    expect(mockReport).toHaveBeenCalledWith('r1', { reason: 'SPAM', note: 'Ad' }),
  );
  await waitFor(() => expect(onReported).toHaveBeenCalledWith('r1'));
  expect(view.getByTestId('report-success')).toBeTruthy();
});
it('keeps the form and row on failure so the member can retry', async () => {
  mockReport.mockRejectedValue(new Error('offline'));
  const onReported = jest.fn();
  const view = renderScreen(
    <ReportReviewSheet reviewId="r1" onClose={jest.fn()} onReported={onReported} />,
  );
  fireEvent.press(view.getByTestId('report-reason-OTHER'));
  fireEvent.press(view.getByTestId('report-submit'));
  await waitFor(() =>
    expect(view.getByText('Could not send the report. Please try again.')).toBeTruthy(),
  );
  expect(onReported).not.toHaveBeenCalled();
});
