import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { AdminPtSession, AdminServiceSession } from '@fit/types';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/classes/pt-calendar',
  useSearchParams: () => new URLSearchParams('week=2026-08-10'),
}));
vi.mock('./pt-session-actions', () => ({
  cancelPtSessionAction: vi.fn(),
  completePtSessionAction: vi.fn(),
  cancelServiceSessionAction: vi.fn(),
  completeServiceSessionAction: vi.fn(),
  createServiceSessionAction: vi.fn(),
}));

const { PtCalendarBoard } = await import('./pt-calendar-board');

/**
 * The PT calendar is the class Schedule's own calendar drawn over personal
 * training. These tests pin what that promise means: the same toolbar
 * (Today · Week · Month, Calendar · List), the same week slot grid with the
 * same cards, the same click-to-create targets - over trainer-calendar
 * sessions and service slots alike.
 */

const messages = {
  admin: {
    ptCalendar: {
      toolbar: {
        prev: 'Previous',
        next: 'Next',
        today: 'Today',
        range: 'Calendar range',
        mode: 'Calendar mode',
        week: 'Week',
        month: 'Month',
        calendar: 'Calendar',
        list: 'List',
      },
      time: 'Time',
      filters: {
        aria: 'PT calendar filters',
        trainer: 'Filter by trainer',
        allTrainers: 'All trainers',
        category: 'Filter by category',
        allCategories: 'All categories',
        clear: 'Clear',
      },
      week: { gridAria: 'Week of PT sessions' },
      grid: { addAt: 'Open a slot at {time}', now: 'Now', stacked: '{count} sessions' },
      card: {
        viewAria: '{title} at {time} - open session',
        spots: '{booked}/{cap} booked',
        remaining: '{remaining} left',
        full: 'Full',
      },
      day: { minutes: '{count} min' },
      status: { SCHEDULED: 'Scheduled', CANCELED: 'Canceled', COMPLETED: 'Completed' },
      slot: { open: 'Open slot' },
      session: { title: 'PT session' },
    },
    services: {
      sessions: {
        openSlot: 'Open a slot',
        noServices: 'No services',
        service: 'Service',
        durationHint: '{count} min',
        date: 'Date',
        time: 'Time',
        notes: 'Notes',
        cancel: 'Cancel',
        saving: 'Saving',
        create: 'Create',
      },
    },
  },
};

const session: AdminPtSession = {
  id: 'pt-1',
  trainerId: 'tr-1',
  trainerName: 'Nini Kavlashvili',
  classTypeId: null,
  classTypeName: null,
  classTypeColor: null,
  startsAt: '2026-08-10T10:00:00.000Z',
  endsAt: '2026-08-10T11:00:00.000Z',
  durationMinutes: 60,
  status: 'SCHEDULED',
  notes: '',
};

const slot: AdminServiceSession = {
  id: 'slot-1',
  serviceId: 'svc-1',
  serviceName: 'Personal session',
  serviceType: 'PERSONAL_TRAINING',
  serviceCoverUrl: null,
  staffId: 'st-1',
  staffName: 'Levan M.',
  memberId: 'm-1',
  memberName: 'Dato Kapanadze',
  startsAt: '2026-08-11T10:00:00.000Z',
  endsAt: '2026-08-11T11:00:00.000Z',
  durationMinutes: 60,
  status: 'BOOKED',
  invoice: null,
  notes: '',
};

function renderBoard({ canWrite = true, trainerId = '' } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <PtCalendarBoard
        view="week"
        weekStart="2026-08-10"
        monthAnchor="2026-08-01"
        dayAnchor="2026-08-10"
        sessions={[session]}
        slots={[slot]}
        services={[]}
        trainers={[{ id: 'tr-1', name: 'Nini Kavlashvili' }]}
        trainerId={trainerId}
        categories={[{ id: 'cat-1', name: 'Boxing' }]}
        categoryId=""
        canWrite={canWrite}
        timeZone="UTC"
        openHour={10}
        closeHour={12}
      />
    </NextIntlClientProvider>,
  );
}

describe('PtCalendarBoard', () => {
  it('draws the schedule toolbar: Today · Week · Month and Calendar · List', () => {
    renderBoard();

    const range = screen.getByRole('group', { name: 'Calendar range' });
    expect(within(range).getByRole('button', { name: 'Today' })).toBeTruthy();
    expect(within(range).getByRole('button', { name: 'Week' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(within(range).getByRole('button', { name: 'Month' })).toBeTruthy();
    const mode = screen.getByRole('group', { name: 'Calendar mode' });
    expect(within(mode).getByRole('button', { name: 'Calendar' })).toBeTruthy();
    expect(within(mode).getByRole('button', { name: 'List' })).toBeTruthy();
    expect(screen.getByRole('grid', { name: 'Week of PT sessions' })).toBeTruthy();
  });

  it('shows a trainer-calendar session as a slot card with its trainer, and no occupancy meter', () => {
    renderBoard();

    const card = screen.getByRole('button', { name: 'PT session at 10:00 - open session' });
    expect(within(card).getByText('Nini Kavlashvili')).toBeTruthy();
    expect(within(card).getByText('60 min')).toBeTruthy();
    // A one-to-one session has no seats: the footer states its status instead.
    expect(within(card).queryByRole('meter')).toBeNull();
    expect(within(card).getByText('Scheduled')).toBeTruthy();
  });

  it('shows a booked service slot under its staff member with the member on the card', () => {
    renderBoard();

    const card = screen.getByRole('button', {
      name: 'Personal session at 10:00 - open session',
    });
    expect(within(card).getByText('Levan M.')).toBeTruthy();
    expect(within(card).getAllByText('Dato Kapanadze').length).toBeGreaterThan(0);
  });

  it('keeps every empty slot a click-to-create target for writers, and none for readers', () => {
    const { unmount } = renderBoard();
    expect(screen.getAllByRole('button', { name: 'Open a slot at 11:00' }).length).toBe(7);
    unmount();

    renderBoard({ canWrite: false });
    expect(screen.queryByRole('button', { name: /Open a slot at/ })).toBeNull();
  });

  it('narrows by trainer through the URL, like the schedule filters', async () => {
    renderBoard();

    await userEvent.selectOptions(screen.getByLabelText('Filter by trainer'), 'tr-1');
    expect(push).toHaveBeenCalledWith('/classes/pt-calendar?week=2026-08-10&trainerId=tr-1');
  });

  it('narrows by service category through the URL', async () => {
    renderBoard();

    await userEvent.selectOptions(screen.getByLabelText('Filter by category'), 'cat-1');
    expect(push).toHaveBeenCalledWith('/classes/pt-calendar?week=2026-08-10&categoryId=cat-1');
  });
});
