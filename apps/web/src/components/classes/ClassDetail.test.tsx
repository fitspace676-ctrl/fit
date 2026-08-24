import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ClassInstanceDetail } from '@fit/types';

// The live-occupancy and booking islands each open a subscription / read the
// session; neither is what these tests are about, so they render as nothing.
vi.mock('./ClassOccupancyLive', () => ({ ClassOccupancyLive: () => null }));
vi.mock('./ClassBookingCta', () => ({ ClassBookingCta: () => null }));

const { ClassDetail } = await import('./ClassDetail');

/**
 * The class cover on the member-facing detail page — the member's equivalent of
 * opening the class in the console, and the surface the booking-modal reference
 * design leads with.
 */

const messages = {
  classes: {
    detail: {
      back: 'All classes',
      about: 'What to expect',
      time: 'Time',
      duration: 'Duration',
      minutes: '{count} minutes',
      trainer: 'Trainer',
      location: 'Location',
      room: 'Room',
      capacity: 'Capacity',
      status: {
        canceled: 'This class has been canceled.',
        completed: 'This class has already taken place.',
      },
    },
    card: { full: 'Full', spotsLeft: '{count} spots left' },
  },
};

function instance(over: Partial<ClassInstanceDetail> = {}): ClassInstanceDetail {
  return {
    id: 'ci-1',
    title: 'Morning Flow',
    description: 'A gentle vinyasa.',
    startsAt: '2026-06-01T09:00:00.000Z',
    endsAt: '2026-06-01T10:00:00.000Z',
    trainerName: 'Nino Beridze',
    locationName: 'Vake Branch',
    room: '',
    capacity: 12,
    bookedCount: 4,
    durationMinutes: 60,
    category: 'Yoga',
    color: '#2563eb',
    imageUrl: null,
    status: 'SCHEDULED',
    ...over,
  };
}

function renderDetail(over: Partial<ClassInstanceDetail> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ClassDetail instance={instance(over)} gymId="gym-1" timeZone="UTC" />
    </NextIntlClientProvider>,
  );
}

describe('ClassDetail cover image', () => {
  it('shows the class cover when the class has one', () => {
    renderDetail({ imageUrl: 'https://pub.example.com/gym-1/classes/cover.jpg' });

    const cover = screen.getByRole('img', { name: 'Morning Flow' });
    expect(cover.getAttribute('src')).toBe('https://pub.example.com/gym-1/classes/cover.jpg');
  });

  it('renders no image at all when the class has no cover', () => {
    renderDetail({ imageUrl: null });

    expect(screen.queryByRole('img')).toBeNull();
    // The rest of the page still renders.
    expect(screen.getByText('Morning Flow')).toBeTruthy();
  });
});
