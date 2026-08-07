import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

const saveSegmentWidgetsAction = vi.fn();
vi.mock('./actions', () => ({
  saveSegmentWidgetsAction: (...args: unknown[]): unknown =>
    saveSegmentWidgetsAction(...args) as unknown,
}));

const { AddWidgetDialog } = await import('./add-widget-dialog');

const messages = {
  admin: {
    dashboard: {
      segments: {
        revenue: 'Revenue',
        classes: 'Classes',
        staff: 'Staff',
        aria: 'Dashboard segments',
      },
      widgets: {
        revenueOverTime: 'Revenue over time',
        revenueByLocation: 'Revenue by location',
        classesMostBooked: 'Most booked classes',
        classesPeakHours: 'Peak hours',
        staffSessionsPerTrainer: 'Sessions per trainer',
      },
      picker: {
        open: 'Add widget',
        title: 'Add widget',
        shared: 'This layout is shared with everyone at your gym.',
        lastWidget: 'Each segment keeps at least one widget.',
        apply: 'Save',
        cancel: 'Cancel',
        saveError: "Couldn't save your widgets.",
      },
    },
  },
};

function renderDialog(selected: Record<string, string[]>) {
  const onSaved = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AddWidgetDialog
        initialSegment="revenue"
        selectedKeys={selected as never}
        onSaved={onSaved}
      />
    </NextIntlClientProvider>,
  );
  return onSaved;
}

const ALL_REVENUE = ['revenue.over-time', 'revenue.by-location'];

describe('AddWidgetDialog', () => {
  beforeEach(() => {
    saveSegmentWidgetsAction.mockReset();
    saveSegmentWidgetsAction.mockResolvedValue({ ok: true, data: undefined });
  });

  it('says plainly that the layout is shared', async () => {
    renderDialog({ revenue: ALL_REVENUE });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    expect(
      screen.getByText('This layout is shared with everyone at your gym.'),
    ).toBeInTheDocument();
  });

  it('checks the widgets the segment currently shows', async () => {
    renderDialog({ revenue: ['revenue.by-location'] });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    expect(screen.getByRole('checkbox', { name: 'Revenue by location' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Revenue over time' })).not.toBeChecked();
  });

  it('saves only the segments whose selection changed', async () => {
    renderDialog({ revenue: ALL_REVENUE, classes: ['classes.most-booked'] });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Revenue by location' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(saveSegmentWidgetsAction).toHaveBeenCalledTimes(1);
    expect(saveSegmentWidgetsAction).toHaveBeenCalledWith('revenue', ['revenue.over-time']);
  });

  // Zero stored widgets would read as "never configured" and restore the whole
  // catalogue, quietly undoing the removal.
  it('will not let the last widget in a segment be unchecked', async () => {
    renderDialog({ revenue: ['revenue.by-location'] });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    const last = screen.getByRole('checkbox', { name: 'Revenue by location' });
    expect(last).toBeDisabled();
    expect(screen.getByText('Each segment keeps at least one widget.')).toBeInTheDocument();
  });

  it('switches the listed widgets when another segment tab is chosen', async () => {
    renderDialog({ revenue: ALL_REVENUE });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Classes' }));

    expect(screen.getByRole('checkbox', { name: 'Most booked classes' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Revenue by location' })).not.toBeInTheDocument();
  });

  it('reports a failed save and keeps the dialog open', async () => {
    saveSegmentWidgetsAction.mockResolvedValue({ ok: false, error: "Couldn't save your widgets." });
    renderDialog({ revenue: ALL_REVENUE });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Revenue by location' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText("Couldn't save your widgets.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  // The tab bar announces role="tablist"/role="tab" — it must honour the
  // roving-tabindex keyboard contract that announcement promises, the same
  // one `segment-tabs.test.tsx` pins for the dashboard's own segment bar.
  it('keeps only the active tab in the tab order', async () => {
    renderDialog({ revenue: ALL_REVENUE });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    expect(screen.getByRole('tab', { name: 'Revenue' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Classes' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'Staff' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves through the tabs with the arrow keys and wraps at both ends', async () => {
    renderDialog({ revenue: ALL_REVENUE });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    // Revenue is first — ArrowLeft must wrap to the last tab, Staff.
    screen.getByRole('tab', { name: 'Revenue' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Staff' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Staff' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Revenue' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('checkbox', { name: 'Sessions per trainer' })).toBeInTheDocument();

    // Staff is last — ArrowRight must wrap back to the first tab, Revenue.
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Revenue' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('checkbox', { name: 'Revenue by location' })).toBeInTheDocument();
  });

  it('jumps to the first and last segment on Home and End', async () => {
    renderDialog({ revenue: ALL_REVENUE });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    screen.getByRole('tab', { name: 'Revenue' }).focus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Staff' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Revenue' })).toHaveAttribute('aria-selected', 'true');
  });
});
