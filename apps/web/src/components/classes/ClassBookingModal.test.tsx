import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ClassInstanceCard, MemberBookingStanding } from '@fit/types';

// Routing, session and the booking action are all out of scope here — the
// modal's cover is what these tests are about.
const policy = vi.hoisted(() => ({ standing: null as MemberBookingStanding | null, signedIn: false, book: vi.fn() }));
vi.mock('./useBookingStanding', () => ({ useBookingStanding: () => policy.standing }));
beforeEach(() => { policy.standing = null; policy.signedIn = false; policy.book.mockReset(); });
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/src/i18n/navigation', () => ({
  usePathname: () => '/member/classes',
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));
vi.mock('@/hooks/use-session', () => ({ useSession: () => ({ user: policy.signedIn ? { id: 'member' } : null, loading: false }) }));
vi.mock('@/app/actions/bookings', () => ({ bookClassAction: policy.book }));

const { ClassBookingModal } = await import('./ClassBookingModal');

/**
 * The class cover in the booking modal — the screen a member actually meets a
 * class on, opened straight from a calendar card. The cover therefore rides on
 * the card projection rather than costing a detail fetch per click.
 */

const messages = {
  classes: {
    modal: { close: 'Close', capacity: 'Capacity', signInToBook: 'Sign in to book' },
    card: { spotsLeft: '{count} spots left', full: 'Full' },
    detail: {
      trainer: 'Trainer',
      location: 'Location',
      booking: {
        book: 'Book this class',
        joinWaitlist: 'Join waitlist',
        booking: 'Booking…',
        fullNote: 'This class is full.',
        bookedTitle: 'You are booked',
        waitlistedTitle: 'You are on the waitlist',
        waitlistPosition: 'Waitlist #{position}',
        errAlreadyBooked: 'Already booked',
        errNotBookable: 'Not bookable',
        errAuth: 'Please sign in',
        errGeneric: 'Something went wrong',
      },
    },
  },
  member: { actions: { close: 'Close', errBookingBlockedUntil: "You can't book classes until {date} because of missed classes.", bookingWarning: 'One more missed class blocks booking for {days} days.', cancellationRule: 'Cancel at least {hours} hours before class.' } },
};

function card(over: Partial<ClassInstanceCard> = {}): ClassInstanceCard {
  return {
    id: 'ci-1',
    title: 'Morning Yoga',
    startsAt: '2026-08-24T10:00:00.000Z',
    endsAt: '2026-08-24T11:00:00.000Z',
    trainerName: 'Nino Beridze',
    trainerId: null,
    trainerAvatarUrl: null,
    locationName: 'Vake Branch',
    capacity: 20,
    bookedCount: 4,
    category: 'Yoga',
    color: '#22c55e',
    imageUrl: null,
    description: '',
    ...over,
  };
}

function renderModal(over: Partial<ClassInstanceCard> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ClassBookingModal instance={card(over)} onClose={vi.fn()} timeZone="UTC" />
    </NextIntlClientProvider>,
  );
}

describe('ClassBookingModal cover image', () => {
  it('shows the class cover when the class has one', () => {
    renderModal({ imageUrl: 'https://pub.example.com/gym-1/classes/cover.jpg' });

    const cover = screen.getByRole('img', { name: 'Morning Yoga' });
    expect(cover.getAttribute('src')).toBe('https://pub.example.com/gym-1/classes/cover.jpg');
  });

  it('renders no image at all when the class has no cover', () => {
    renderModal({ imageUrl: null });

    expect(screen.queryByRole('img')).toBeNull();
    // The rest of the modal still renders.
    expect(screen.getByText('Morning Yoga')).toBeTruthy();
  });

  it('reads the class description in the modal, in full, when the template has one', () => {
    renderModal({ description: 'A gentle vinyasa to start the day.\nBring a mat.' });
    expect(screen.getByText(/A gentle vinyasa to start the day/)).toBeTruthy();
  });
});

it('states the warning and cancellation rule before confirmation', () => {
  policy.standing = { cancellationCutoffHours: 4, noShow: { active: true, limit: 3, windowDays: 30, blockDays: 14, count: 2, remaining: 1 }, block: null };
  renderModal();
  expect(screen.getByText('One more missed class blocks booking for 14 days.')).toBeTruthy();
  expect(screen.getByText('Cancel at least 4 hours before class.')).toBeTruthy();
});

it('renders the normalized blocked expiry returned by the server action', async () => {
  policy.signedIn = true;
  // The server action normalizes data.blockedUntil into its client-safe result.
  policy.book.mockResolvedValue({ ok: false, code: 'MEMBER_BOOKING_BLOCKED', blockedUntil: '2027-01-01T12:00:00Z' });
  renderModal();
  fireEvent.click(screen.getByRole('button', { name: 'Book this class' }));
  expect(await screen.findByText("You can't book classes until January 1, 2027 because of missed classes.")).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Book this class' })).toBeDisabled();
});
