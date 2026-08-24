import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ClassInstanceCard } from '@fit/types';

// Routing, session and the booking action are all out of scope here — the
// modal's cover is what these tests are about.
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/src/i18n/navigation', () => ({
  usePathname: () => '/member/classes',
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));
vi.mock('@/hooks/use-session', () => ({ useSession: () => ({ user: null, loading: false }) }));
vi.mock('@/app/actions/bookings', () => ({ bookClassAction: vi.fn() }));

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
  member: { actions: { close: 'Close' } },
};

function card(over: Partial<ClassInstanceCard> = {}): ClassInstanceCard {
  return {
    id: 'ci-1',
    title: 'Morning Yoga',
    startsAt: '2026-08-24T10:00:00.000Z',
    endsAt: '2026-08-24T11:00:00.000Z',
    trainerName: 'Nino Beridze',
    locationName: 'Vake Branch',
    capacity: 20,
    bookedCount: 4,
    category: 'Yoga',
    color: '#22c55e',
    imageUrl: null,
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
});
