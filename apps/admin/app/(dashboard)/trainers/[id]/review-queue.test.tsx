import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@fit/i18n/locales/en.json';
import { ReviewQueue } from './trainer-tabs';
import { loadReviewQueueAction, moderateReviewAction } from '../actions';

vi.mock('../actions', () => ({ loadReviewQueueAction: vi.fn(), moderateReviewAction: vi.fn() }));
vi.mock('./availability-editor', () => ({ TrainerAvailabilityEditor: () => null }));
const row = {
  id: 'r1',
  rating: 1,
  comment: 'Review text',
  authorName: 'Member',
  authorEmail: 'a@example.com',
  status: 'VISIBLE' as const,
  classInstanceId: null,
  classTitle: null,
  createdAt: '2026-01-01T00:00:00Z',
  reportCount: 2,
  reports: [{ reason: 'SPAM' as const, note: 'Repeated ad' }, { reason: 'OFFENSIVE' as const }],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadReviewQueueAction).mockResolvedValue({
    ok: true,
    data: { data: [row], page: 1, limit: 20, total: 1 },
  });
  vi.mocked(moderateReviewAction).mockResolvedValue({
    ok: true,
    data: { review: { ...row, status: 'HIDDEN' } },
  });
});
function mount() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ReviewQueue trainerId="trainer" />
    </NextIntlClientProvider>,
  );
}
describe('inline review moderation', () => {
  it('shows report counts and reasons and calls the existing hide action', async () => {
    mount();
    expect(await screen.findByText('Reports: 2')).toBeInTheDocument();
    expect(screen.getByText('Spam — Repeated ad')).toBeInTheDocument();
    expect(screen.getByText('Offensive content')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Hide review'));
    await waitFor(() => expect(moderateReviewAction).toHaveBeenCalledWith('r1', true));
    await waitFor(() => expect(loadReviewQueueAction).toHaveBeenCalledTimes(2));
  });
  it('shows a load failure instead of an empty queue', async () => {
    vi.mocked(loadReviewQueueAction).mockResolvedValue({ ok: false, error: 'Unavailable' });
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
  });
});
