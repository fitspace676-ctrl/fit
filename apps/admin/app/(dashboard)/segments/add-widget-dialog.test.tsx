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
        sales: 'Sales',
        members: 'Members',
        revenue: 'Revenue',
        classes: 'Classes',
        staff: 'Staff',
        aria: 'Dashboard segments',
      },
      widgets: {
        salesPaymentMethod: 'Sales by payment method',
        salesTopProducts: 'Top-selling products',
        salesTopPlans: 'Top-selling plans',
        membersNewSignups: 'New member signups',
        membersChurn: 'Member churn',
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
      <AddWidgetDialog initialSegment="sales" selectedKeys={selected as never} onSaved={onSaved} />
    </NextIntlClientProvider>,
  );
  return onSaved;
}

const ALL_SALES = ['sales.payment-method', 'sales.top-products', 'sales.top-plans'];

describe('AddWidgetDialog', () => {
  beforeEach(() => {
    saveSegmentWidgetsAction.mockReset();
    saveSegmentWidgetsAction.mockResolvedValue({ ok: true, data: undefined });
  });

  it('says plainly that the layout is shared', async () => {
    renderDialog({ sales: ALL_SALES });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    expect(
      screen.getByText('This layout is shared with everyone at your gym.'),
    ).toBeInTheDocument();
  });

  it('checks the widgets the segment currently shows', async () => {
    renderDialog({ sales: ['sales.top-plans'] });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    expect(screen.getByRole('checkbox', { name: 'Top-selling plans' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Top-selling products' })).not.toBeChecked();
  });

  it('saves only the segments whose selection changed', async () => {
    renderDialog({ sales: ALL_SALES, members: ['members.churn'] });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Top-selling products' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(saveSegmentWidgetsAction).toHaveBeenCalledTimes(1);
    expect(saveSegmentWidgetsAction).toHaveBeenCalledWith('sales', [
      'sales.payment-method',
      'sales.top-plans',
    ]);
  });

  // Zero stored widgets would read as "never configured" and restore the whole
  // catalogue, quietly undoing the removal.
  it('will not let the last widget in a segment be unchecked', async () => {
    renderDialog({ sales: ['sales.top-plans'] });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    const last = screen.getByRole('checkbox', { name: 'Top-selling plans' });
    expect(last).toBeDisabled();
    expect(screen.getByText('Each segment keeps at least one widget.')).toBeInTheDocument();
  });

  it('switches the listed widgets when another segment tab is chosen', async () => {
    renderDialog({ sales: ALL_SALES });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Members' }));

    expect(screen.getByRole('checkbox', { name: 'New member signups' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Top-selling plans' })).not.toBeInTheDocument();
  });

  it('reports a failed save and keeps the dialog open', async () => {
    saveSegmentWidgetsAction.mockResolvedValue({ ok: false, error: "Couldn't save your widgets." });
    renderDialog({ sales: ALL_SALES });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Top-selling products' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText("Couldn't save your widgets.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
