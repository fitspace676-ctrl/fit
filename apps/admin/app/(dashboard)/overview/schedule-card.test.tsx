import { render, screen } from '@testing-library/react';
import { it, expect } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardOverviewResponse } from '@fit/types';
import { GymTimeZoneProvider } from '@/components/gym-timezone';
import { ScheduleCard } from './schedule-card';

it('shows the stored 05:00Z yoga class at 09:00 on the Tbilisi gym clock', () => {
  const data = {
    todaysSchedule: [
      {
        startsAt: '2026-11-24T05:00:00Z',
        title: 'MORNING YOGA',
        trainerName: 'Trainer',
        booked: 4,
        capacity: 10,
        color: null,
      },
    ],
  } as DashboardOverviewResponse;
  render(
    <NextIntlClientProvider
      locale="ka"
      timeZone="UTC"
      messages={{
        admin: { dashboard: { schedule: { title: 'Schedule', full: '{fill}%' } } },
      }}
    >
      <GymTimeZoneProvider timeZone="Asia/Tbilisi">
        <ScheduleCard data={data} />
      </GymTimeZoneProvider>
    </NextIntlClientProvider>,
  );
  expect(screen.getByText('09:00')).toBeInTheDocument();
  expect(screen.queryByText('05:00')).not.toBeInTheDocument();
});
