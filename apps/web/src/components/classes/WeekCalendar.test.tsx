import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ClassInstanceCard } from '@fit/types';
import { WeekCalendar } from './WeekCalendar';

/**
 * The member week calendar, on the same slot-card grid the console uses: one row
 * per hour, one column per day, and every class an equal-height card. Classes
 * that share an hour stack inside their day cell instead of being squeezed into
 * side-by-side lanes that truncate their titles.
 */

const messages = {
  classes: {
    weekView: {
      label: 'Weekly calendar',
      prev: 'Previous week',
      next: 'Next week',
      today: 'This week',
      dayEmpty: 'No classes this day',
      time: 'Time',
    },
    detail: { minutes: '{count} min' },
    card: { spotsLeft: '{count} spots left', full: 'Full' },
  },
};

// Monday 2026-08-24 .. Sunday 2026-08-30, read on the gym's clock (UTC here).
const WEEK = new Date('2026-08-24T00:00:00.000Z');

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

function renderWeek(instances: ClassInstanceCard[], onClassClick: (id: string) => void = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <WeekCalendar
        instances={instances}
        week={WEEK}
        onWeekChange={vi.fn()}
        onClassClick={onClassClick}
        timeZone="UTC"
      />
    </NextIntlClientProvider>,
  );
}

describe('WeekCalendar slot cards', () => {
  it('renders a class as a card carrying time, title, trainer, duration and spots', () => {
    renderWeek([card()]);

    const button = screen.getByRole('button', { name: /Morning Yoga/ });
    expect(within(button).getByText('10:00')).toBeTruthy();
    expect(within(button).getByText('Morning Yoga')).toBeTruthy();
    expect(within(button).getByText('Nino Beridze')).toBeTruthy();
    expect(within(button).getByText('60 min')).toBeTruthy();
    expect(within(button).getByText('16 spots left')).toBeTruthy();
  });

  it('stacks same-hour classes in one day cell and opens the one clicked', async () => {
    const onClassClick = vi.fn();
    const second = card({
      id: 'ci-2',
      title: 'Body Ballet',
      startsAt: '2026-08-24T10:30:00.000Z',
      endsAt: '2026-08-24T11:30:00.000Z',
      trainerName: 'Vika Kikabidze',
    });
    renderWeek([card(), second], onClassClick);

    // Both survive — the old lane layout truncated one of them.
    expect(screen.getByRole('button', { name: /Morning Yoga/ })).toBeTruthy();
    const target = screen.getByRole('button', { name: /Body Ballet/ });

    await userEvent.click(target);
    expect(onClassClick).toHaveBeenCalledWith('ci-2');
  });

  it('says a class is full rather than showing zero spots left', () => {
    renderWeek([card({ bookedCount: 20 })]);

    const button = screen.getByRole('button', { name: /Morning Yoga/ });
    expect(within(button).getByText('Full')).toBeTruthy();
  });

  it('puts a class on the hour row it starts on, in its own day column', () => {
    renderWeek([
      card(),
      card({
        id: 'ci-3',
        title: 'Evening Spin',
        startsAt: '2026-08-26T18:00:00.000Z',
        endsAt: '2026-08-26T19:00:00.000Z',
      }),
    ]);

    // Each class sits in the cell for its own day and start hour.
    const rowFor = (hour: string) =>
      screen
        .getAllByRole('row')
        .find((r) => within(r).queryByRole('rowheader')?.textContent === hour);

    const tenAm = rowFor('10:00');
    const sixPm = rowFor('18:00');
    expect(tenAm).toBeTruthy();
    expect(sixPm).toBeTruthy();
    // Monday's yoga is on the 10:00 row, Wednesday's spin on the 18:00 row.
    expect(within(tenAm!).getByRole('button', { name: /Morning Yoga/ })).toBeTruthy();
    expect(within(tenAm!).queryByRole('button', { name: /Evening Spin/ })).toBeNull();
    expect(within(sixPm!).getByRole('button', { name: /Evening Spin/ })).toBeTruthy();
  });
});
