import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import type { AdminScheduleInstance } from '@fit/types';
import { toIsoDate, weekDays } from './week';

const { WeekGrid } = await import('./week-grid');

/**
 * The slot-card week grid. These tests pin the behaviour the redesign was asked
 * for: classes group into hour rows as equal-height cards carrying trainer,
 * duration and occupancy; the footer states the class's fate; and every empty
 * slot stays a click-to-create target when the staffer may add classes.
 */

const messages = {
  admin: {
    schedule: {
      time: 'Time',
      week: { gridAria: 'Week schedule' },
      grid: {
        addAt: 'Add a class at {time}',
        now: 'Now',
        stacked: '{count} classes at this time',
      },
      card: {
        viewAria: '{title} at {time} - open class',
        spots: '{booked}/{cap} booked',
        remaining: '{remaining} left',
        full: 'Full',
      },
      day: { minutes: '{count} min' },
      status: {
        SCHEDULED: 'Scheduled',
        CANCELED: 'Canceled',
        COMPLETED: 'Completed',
      },
    },
  },
};

// Monday 2026-08-10 .. Sunday 2026-08-16.
const days = weekDays(new Date('2026-08-10T00:00:00.000Z'));
const MONDAY = toIsoDate(days[0]!);

function makeInstance(overrides: Partial<AdminScheduleInstance>): AdminScheduleInstance {
  return {
    id: 'inst-1',
    templateId: null,
    classTypeId: null,
    title: 'Pilates Reformer',
    category: 'Pilates',
    description: '',
    pricingRule: 'INCLUDED',
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

function renderGrid(
  instances: AdminScheduleInstance[],
  {
    onOpen = vi.fn(),
    onPickSlot = null,
  }: {
    onOpen?: (instance: AdminScheduleInstance) => void;
    onPickSlot?: ((dayIso: string, startTime: string) => void) | null;
  } = {},
) {
  const byDay = new Map<string, AdminScheduleInstance[]>();
  for (const instance of instances) {
    const key = instance.startsAt.slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), instance]);
  }

  function Harness() {
    const t = useTranslations('admin.schedule');
    return (
      <WeekGrid
        days={days}
        byDay={byDay}
        todayKey="2026-08-10"
        locale="en"
        timeZone="UTC"
        openHour={10}
        closeHour={12}
        t={t}
        onOpen={onOpen}
        onPickSlot={onPickSlot}
      />
    );
  }

  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <Harness />
    </NextIntlClientProvider>,
  );
}

describe('WeekGrid slot cards', () => {
  it('renders a class as a card carrying time, trainer, duration and occupancy', () => {
    renderGrid([makeInstance({})]);

    const card = screen.getByRole('button', {
      name: 'Pilates Reformer at 10:00 - open class',
    });
    expect(within(card).getByText('10:00')).toBeTruthy();
    expect(within(card).getByText('Pilates Reformer')).toBeTruthy();
    expect(within(card).getByText('Nini Kavlashvili')).toBeTruthy();
    expect(within(card).getByText('50 min')).toBeTruthy();

    const meter = within(card).getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('3');
    expect(meter.getAttribute('aria-valuemax')).toBe('5');
    expect(within(card).getByText('3/5 booked')).toBeTruthy();
  });

  it('stacks same-hour classes in one day cell and opens the one clicked', async () => {
    const onOpen = vi.fn();
    const first = makeInstance({ id: 'a', title: 'Pilates Reformer' });
    const second = makeInstance({
      id: 'b',
      title: 'Body Ballet',
      startsAt: '2026-08-10T10:15:00.000Z',
      endsAt: '2026-08-10T11:15:00.000Z',
      durationMinutes: 60,
      trainerName: 'Vika Kikabidze',
    });
    renderGrid([first, second], { onOpen });

    const target = screen.getByRole('button', { name: 'Body Ballet at 10:15 - open class' });
    await userEvent.click(target);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(second);
  });

  it('states the class fate in the footer: canceled, completed, or how booked it is', () => {
    renderGrid([
      makeInstance({ id: 'a', status: 'CANCELED' }),
      makeInstance({
        id: 'b',
        status: 'COMPLETED',
        startsAt: '2026-08-11T10:00:00.000Z',
        endsAt: '2026-08-11T10:50:00.000Z',
      }),
      makeInstance({
        id: 'c',
        bookedCount: 5,
        startsAt: '2026-08-12T10:00:00.000Z',
        endsAt: '2026-08-12T10:50:00.000Z',
      }),
    ]);

    expect(screen.getByText('Canceled')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('Full')).toBeTruthy();
  });

  it('keeps every slot a click-to-create target for staff who may add classes', async () => {
    const onPickSlot = vi.fn();
    renderGrid([makeInstance({})], { onPickSlot });

    // Seven day columns share the 11:00 row; the first target is Monday's.
    const targets = screen.getAllByRole('button', { name: 'Add a class at 11:00' });
    await userEvent.click(targets[0]!);
    expect(onPickSlot).toHaveBeenCalledWith(MONDAY, '11:00');
  });

  it('offers no add targets when the staffer cannot create classes', () => {
    renderGrid([makeInstance({})], { onPickSlot: null });
    expect(screen.queryByRole('button', { name: /Add a class at/ })).toBeNull();
  });
});
