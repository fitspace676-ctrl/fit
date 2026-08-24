import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ToastProvider } from '@/components/ui';
import type { AdminScheduleInstance } from '@fit/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('./actions', () => ({
  loadInstanceDetailAction: vi.fn(() => new Promise(() => {})),
  cancelInstanceAction: vi.fn(),
  markAttendanceAction: vi.fn(),
  promoteWaitlistAction: vi.fn(),
  searchMembersAction: vi.fn(),
  bookMemberOntoClassAction: vi.fn(),
}));

const { ClassDrawer } = await import('./class-drawer');

/**
 * The class cover in the drawer. The clicked calendar block already carries
 * `imageUrl`, so the cover paints immediately — before the roster fetch that
 * these tests deliberately leave pending.
 */

const messages = {
  admin: {
    schedule: {
      drawer: {
        loading: 'Loading class…',
        status: { SCHEDULED: 'Scheduled', CANCELED: 'Canceled', COMPLETED: 'Completed' },
        occupancy: {
          spots: '{booked} of {cap} booked',
          remaining: '{remaining} left',
          full: 'Full',
          waitlist: '{count} on the waitlist',
        },
        details: {
          category: 'Category',
          about: 'About',
          pricing: 'Pricing',
          free: 'Free for members',
          included: 'Included in plan',
          paid: 'Paid',
        },
        roster: {
          title: 'Roster',
          empty: 'No bookings yet.',
          waitlistPosition: 'Waitlist #{position}',
          markGroup: 'Attendance for {member}',
          status: {
            BOOKED: 'Booked',
            ATTENDED: 'Attended',
            NO_SHOW: 'No-show',
            WAITLIST: 'Waitlist',
          },
          promote: 'Promote',
          promoteMember: 'Promote {member} into a seat',
        },
        book: {
          title: 'Book a member',
          hint: 'Search for a member to book them onto this class.',
          searchLabel: 'Search members to book',
          searchPlaceholder: 'Search by name or email',
          searching: 'Searching…',
          noResults: 'No members match “{query}”.',
          action: 'Book',
          bookMember: 'Book {member} onto this class',
        },
        actions: { edit: 'Edit class', cancel: 'Cancel class' },
        confirm: {
          title: 'Cancel this class?',
          message: 'Canceling “{title}” releases every booking.',
          confirm: 'Cancel class',
          cancel: 'Keep class',
        },
        toast: { canceled: 'Class canceled', promoted: 'Member promoted', booked: 'Member booked' },
      },
    },
  },
};

function instance(overrides: Partial<AdminScheduleInstance> = {}): AdminScheduleInstance {
  return {
    id: 'inst-1',
    templateId: 'ct-1',
    classTypeId: null,
    title: 'Pilates Reformer',
    category: 'Pilates',
    description: '',
    pricingRule: 'FREE',
    priceMinor: null,
    color: '#22c55e',
    imageUrl: null,
    startsAt: '2026-08-10T10:00:00.000Z',
    endsAt: '2026-08-10T10:50:00.000Z',
    durationMinutes: 50,
    trainerName: 'Nini Kavlashvili',
    locationName: null,
    room: null,
    capacity: 5,
    bookedCount: 3,
    status: 'SCHEDULED',
    ...overrides,
  };
}

function renderDrawer(over: Partial<AdminScheduleInstance> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ToastProvider>
        <ClassDrawer
          instance={instance(over)}
          open
          onClose={vi.fn()}
          canWrite={false}
          locale="en"
          timeZone="UTC"
        />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe('ClassDrawer cover image', () => {
  it('shows the class cover when the class has one', () => {
    renderDrawer({ imageUrl: 'https://pub.example.com/gym-1/classes/cover.jpg' });

    const cover = document.querySelector(
      'img[src="https://pub.example.com/gym-1/classes/cover.jpg"]',
    );
    expect(cover).not.toBeNull();
  });

  it('renders no cover element at all when the class has none', () => {
    renderDrawer({ imageUrl: null });

    expect(document.querySelector('img')).toBeNull();
    // The rest of the drawer still renders.
    expect(screen.getByText('Pilates Reformer')).toBeTruthy();
  });
});
