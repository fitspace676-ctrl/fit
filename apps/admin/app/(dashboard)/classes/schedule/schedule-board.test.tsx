import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { navigationMock } from '@/test/next-navigation-mock';
import { ALL_LOCATIONS } from '@/lib/active-location';
import { ActiveLocationProvider } from '@/components/active-location';
import { ToastProvider } from '@/components/ui';

vi.mock('next/navigation', () => navigationMock.factory());

// The board always mounts the (closed) class drawer, whose server actions would
// otherwise be pulled in. Nothing here opens it.
vi.mock('./actions', () => ({
  loadInstanceDetailAction: vi.fn(() => new Promise(() => {})),
  cancelInstanceAction: vi.fn(),
  markAttendanceAction: vi.fn(),
  promoteWaitlistAction: vi.fn(),
  searchMembersAction: vi.fn(),
  bookMemberOntoClassAction: vi.fn(),
}));

// The board opens a live-occupancy `EventSource` on mount; jsdom has no such
// global, and none of what these tests assert depends on the stream.
vi.mock('@/hooks/use-occupancy-stream', () => ({ useOccupancyStream: () => {} }));

const { ScheduleBoard } = await import('./schedule-board');

/**
 * The schedule toolbar's filter contract, after the branch moved out of it.
 *
 * The board used to own a location select beside the trainer one, and a "Clear"
 * that dropped both. The branch is now the top bar's, console-wide, so these
 * tests pin the three things that removal could quietly get wrong:
 *
 *  1. the page no longer offers a second, competing branch control;
 *  2. "Clear" clears the page's own filter and *only* that — clearing a
 *     console-wide setting from a page-level button would silently re-scope every
 *     other screen, and would not even be visible from here;
 *  3. an empty grid still reads as "nothing matches" rather than "nothing is on"
 *     when a branch is narrowing it — the one thing the board still needs the
 *     active branch for.
 */

const messages = {
  admin: {
    schedule: {
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
        addClass: 'Add Class',
      },
      filters: {
        aria: 'Schedule filters',
        trainer: 'Filter by trainer',
        allTrainers: 'All trainers',
        clear: 'Clear',
      },
      empty: {
        day: 'No classes',
        week: 'No classes scheduled this week.',
        filtered: 'No classes match these filters this week.',
      },
      week: { gridAria: 'Week schedule' },
      // The board always mounts the class drawer, closed. It resolves its whole
      // namespace up front, so a stub keeps the run free of MISSING_MESSAGE noise
      // that has nothing to do with what is under test.
      drawer: { loading: 'Loading class…' },
    },
  },
};

const TRAINERS = [
  { id: 'trainer-1', name: 'Nini Kavlashvili' },
  { id: 'trainer-2', name: 'Luka Beridze' },
];

const LOCATIONS = [
  { id: 'loc-1', name: 'Vake' },
  { id: 'loc-2', name: 'Saburtalo' },
];

/** Monday of the week the board is anchored on for every test here. */
const MONDAY = '2026-08-10';

function renderBoard({
  trainerId = '',
  activeLocation = ALL_LOCATIONS,
}: { trainerId?: string; activeLocation?: string } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ToastProvider>
        <ActiveLocationProvider initial={activeLocation} locations={LOCATIONS}>
          <ScheduleBoard
            view="list"
            weekStart={MONDAY}
            monthAnchor="2026-08-01"
            dayAnchor={MONDAY}
            instances={[]}
            trainers={TRAINERS}
            trainerId={trainerId}
            canWrite={false}
            addClass={null}
            timeZone="UTC"
            openHour={6}
            closeHour={22}
          />
        </ActiveLocationProvider>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

/** The filter bar, addressed by its own group label rather than by position. */
function filterBar(): HTMLElement {
  return screen.getByRole('group', { name: 'Schedule filters' });
}

describe('schedule filter bar', () => {
  beforeEach(() => {
    navigationMock.reset();
  });

  it('offers the trainer filter and no branch filter', () => {
    renderBoard();
    const selects = within(filterBar()).getAllByRole('combobox');
    expect(selects).toHaveLength(1);
    // The one select left is the trainer's — it lists trainers, not branches.
    expect(within(selects[0]!).getByRole('option', { name: 'All trainers' })).toBeInTheDocument();
    expect(within(filterBar()).queryByRole('option', { name: 'Saburtalo' })).toBeNull();
  });

  it('clears the trainer without touching the branch on the URL', async () => {
    navigationMock.setSearch('trainerId=trainer-1&locationId=loc-2&view=list');
    renderBoard({ trainerId: 'trainer-1', activeLocation: 'loc-2' });

    await userEvent.click(within(filterBar()).getByRole('button', { name: 'Clear' }));

    expect(navigationMock.push).toHaveBeenCalledTimes(1);
    const target = navigationMock.push.mock.calls[0]![0] as string;
    const params = new URLSearchParams(target.slice(target.indexOf('?')));
    expect(params.get('trainerId')).toBeNull();
    // The console-wide branch survives a page-level clear, as does the view.
    expect(params.get('locationId')).toBe('loc-2');
    expect(params.get('view')).toBe('list');
  });

  it('does not offer Clear when only the console-wide branch is narrowing the grid', () => {
    navigationMock.setSearch('locationId=loc-2');
    renderBoard({ activeLocation: 'loc-2' });
    expect(within(filterBar()).queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('offers Clear as soon as the page owns a filter of its own', () => {
    navigationMock.setSearch('trainerId=trainer-1');
    renderBoard({ trainerId: 'trainer-1' });
    expect(within(filterBar()).getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });
});

describe('schedule empty state', () => {
  beforeEach(() => {
    navigationMock.reset();
  });

  it('reads as a genuinely empty week when nothing is narrowing it', () => {
    renderBoard();
    expect(screen.getByText('No classes scheduled this week.')).toBeInTheDocument();
  });

  it('reads as narrowed when a branch is selected, even with no page filter', () => {
    navigationMock.setSearch('locationId=loc-2');
    renderBoard({ activeLocation: 'loc-2' });
    expect(screen.getByText('No classes match these filters this week.')).toBeInTheDocument();
  });

  it('reads as narrowed when a trainer is selected', () => {
    navigationMock.setSearch('trainerId=trainer-1');
    renderBoard({ trainerId: 'trainer-1' });
    expect(screen.getByText('No classes match these filters this week.')).toBeInTheDocument();
  });
});
