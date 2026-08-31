import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { navigationMock } from '@/test/next-navigation-mock';

vi.mock('next/navigation', () => navigationMock.factory());

const { ReportRangeControl } = await import('./report-range-control');

const messages = {
  admin: {
    reports: {
      reportingRange: 'Reporting range',
      rangeToday: 'Today',
      range7d: '7 days',
      rangeMtd: 'Month to date',
      rangeCustom: 'Custom',
      customRange: 'Custom date range',
    },
  },
};

function renderControl(props: Partial<Parameters<typeof ReportRangeControl>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ReportRangeControl range="mtd" from="2026-08-01" to="2026-08-07" {...props} />
    </NextIntlClientProvider>,
  );
}

describe('ReportRangeControl', () => {
  beforeEach(() => {
    navigationMock.reset();
  });

  it('offers exactly today, 7 days, month to date and custom, with the current one marked', () => {
    renderControl();
    const group = screen.getByRole('radiogroup', { name: 'Reporting range' });
    const labels = Array.from(group.querySelectorAll('[role="radio"]')).map((el) =>
      el.textContent?.trim(),
    );
    expect(labels).toEqual(['Today', '7 days', 'Month to date', 'Custom']);
    expect(screen.getByRole('radio', { name: 'Month to date' })).toBeChecked();
  });

  it('writes a preset to the query and drops any stale custom days', async () => {
    navigationMock.setSearch('report=sales-summary&range=custom&from=2026-01-01&to=2026-01-31');
    renderControl({ range: 'custom', from: '2026-01-01', to: '2026-01-31' });
    await userEvent.click(screen.getByRole('radio', { name: '7 days' }));
    expect(navigationMock.replace).toHaveBeenCalledWith('/?report=sales-summary&range=7d', {
      scroll: false,
    });
  });

  it('shows the days the current window resolved to', () => {
    renderControl({ range: '7d', from: '2026-08-01', to: '2026-08-07' });
    // The date control reads the resolved window even on a preset, so the
    // reader sees which days "7 days" actually were.
    expect(screen.getByRole('button', { name: /Custom date range/ })).toHaveTextContent(
      'Aug 1 – Aug 7',
    );
  });

  // Astryx's `DateRangeInput` hands back a range only once two calendar cells
  // are clicked; drive it for real rather than reaching around it.
  it('picking two days writes a custom range', async () => {
    navigationMock.setSearch('report=sales-summary&range=mtd');
    renderControl({ range: 'mtd', from: '2026-08-01', to: '2026-08-07' });

    await userEvent.click(screen.getByRole('button', { name: /Custom date range/ }));
    await userEvent.click(screen.getByRole('button', { name: /August 3, 2026/ }));
    await userEvent.click(screen.getByRole('button', { name: /August 10, 2026/ }));

    expect(navigationMock.replace).toHaveBeenCalledWith(
      '/?report=sales-summary&range=custom&from=2026-08-03&to=2026-08-10',
      { scroll: false },
    );
  });
});
