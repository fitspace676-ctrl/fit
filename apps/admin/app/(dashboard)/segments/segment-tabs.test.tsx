import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardSegment } from '@fit/types';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { SegmentTabs } from './segment-tabs';

const messages = {
  admin: {
    dashboard: {
      segments: {
        aria: 'Dashboard segments',
        overview: 'Overview',
        sales: 'Sales',
        members: 'Members',
        revenue: 'Revenue',
        classes: 'Classes',
        staff: 'Staff',
      },
    },
  },
};

function renderTabs(active: DashboardSegment = 'overview', onSelect = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ThemeProvider initial="dark">
        <SegmentTabs active={active} onSelect={onSelect} />
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
  return onSelect;
}

describe('SegmentTabs', () => {
  it('renders one tab per segment, overview first', () => {
    renderTabs();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Overview',
      'Sales',
      'Members',
      'Revenue',
      'Classes',
      'Staff',
    ]);
  });

  it('marks only the active tab selected', () => {
    renderTabs('overview');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Sales' })).toHaveAttribute('aria-selected', 'false');
  });

  it('reports the chosen segment on click', async () => {
    const onSelect = renderTabs('overview');
    await userEvent.click(screen.getByRole('tab', { name: 'Members' }));
    expect(onSelect).toHaveBeenCalledWith('members');
  });

  // Roving tabindex: Tab enters the bar once, arrows move within it.
  it('keeps only the active tab in the tab order', () => {
    renderTabs('sales');
    expect(screen.getByRole('tab', { name: 'Sales' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('tabindex', '-1');
  });

  it('selects the next segment on ArrowRight and wraps at the end', async () => {
    const onSelect = renderTabs('staff');
    screen.getByRole('tab', { name: 'Staff' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenCalledWith('overview');
  });

  it('jumps to the first and last segment on Home and End', async () => {
    const onSelect = renderTabs('members');
    screen.getByRole('tab', { name: 'Members' }).focus();
    await userEvent.keyboard('{End}');
    expect(onSelect).toHaveBeenCalledWith('staff');
    await userEvent.keyboard('{Home}');
    expect(onSelect).toHaveBeenCalledWith('overview');
  });

  // The tablist half of the ARIA pattern was in place from the start; this is
  // the other half — every tab must name the panel it drives, and its own id is
  // what the panel points back at with aria-labelledby.
  it('points every tab at the panel and gives each a stable id', () => {
    renderTabs('overview');
    for (const segment of ['overview', 'sales', 'members', 'revenue', 'classes', 'staff']) {
      const label = segment.charAt(0).toUpperCase() + segment.slice(1);
      const tab = screen.getByRole('tab', { name: label });
      expect(tab).toHaveAttribute('id', `dashboard-tab-${segment}`);
      expect(tab).toHaveAttribute('aria-controls', 'dashboard-tabpanel');
    }
  });
});
