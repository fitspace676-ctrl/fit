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
        members: 'Members',
        revenue: 'Revenue',
        classes: 'Classes',
        staff: 'Staff',
        aria: 'Dashboard segments',
      },
      widgets: {
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
      <AddWidgetDialog
        initialSegment="members"
        selectedKeys={selected as never}
        onSaved={onSaved}
      />
    </NextIntlClientProvider>,
  );
  return onSaved;
}

const ALL_MEMBERS = ['members.new-signups', 'members.churn'];

describe('AddWidgetDialog', () => {
  beforeEach(() => {
    saveSegmentWidgetsAction.mockReset();
    saveSegmentWidgetsAction.mockResolvedValue({ ok: true, data: undefined });
  });

  it('says plainly that the layout is shared', async () => {
    renderDialog({ members: ALL_MEMBERS });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    expect(
      screen.getByText('This layout is shared with everyone at your gym.'),
    ).toBeInTheDocument();
  });

  it('checks the widgets the segment currently shows', async () => {
    renderDialog({ members: ['members.churn'] });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    expect(screen.getByRole('checkbox', { name: 'Member churn' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'New member signups' })).not.toBeChecked();
  });

  it('saves only the segments whose selection changed', async () => {
    renderDialog({ members: ALL_MEMBERS, revenue: ['revenue.over-time'] });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Member churn' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(saveSegmentWidgetsAction).toHaveBeenCalledTimes(1);
    expect(saveSegmentWidgetsAction).toHaveBeenCalledWith('members', ['members.new-signups']);
  });

  // Zero stored widgets would read as "never configured" and restore the whole
  // catalogue, quietly undoing the removal.
  it('will not let the last widget in a segment be unchecked', async () => {
    renderDialog({ members: ['members.churn'] });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    const last = screen.getByRole('checkbox', { name: 'Member churn' });
    expect(last).toBeDisabled();
    expect(screen.getByText('Each segment keeps at least one widget.')).toBeInTheDocument();
  });

  it('switches the listed widgets when another segment tab is chosen', async () => {
    renderDialog({ members: ALL_MEMBERS });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Revenue' }));

    expect(screen.getByRole('checkbox', { name: 'Revenue over time' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Member churn' })).not.toBeInTheDocument();
  });

  it('reports a failed save and keeps the dialog open', async () => {
    saveSegmentWidgetsAction.mockResolvedValue({ ok: false, error: "Couldn't save your widgets." });
    renderDialog({ members: ALL_MEMBERS });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Member churn' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText("Couldn't save your widgets.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  // The tab bar announces role="tablist"/role="tab" — it must honour the
  // roving-tabindex keyboard contract that announcement promises, the same
  // one `segment-tabs.test.tsx` pins for the dashboard's own segment bar.
  it('keeps only the active tab in the tab order', async () => {
    renderDialog({ members: ALL_MEMBERS });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    expect(screen.getByRole('tab', { name: 'Members' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Revenue' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'Staff' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves through the tabs with the arrow keys and wraps at both ends', async () => {
    renderDialog({ members: ALL_MEMBERS });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    // Members is first — ArrowLeft must wrap to the last tab, Staff.
    screen.getByRole('tab', { name: 'Members' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Staff' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Staff' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Members' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('checkbox', { name: 'Sessions per trainer' })).toBeInTheDocument();

    // Staff is last — ArrowRight must wrap back to the first tab, Members.
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Members' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('checkbox', { name: 'Member churn' })).toBeInTheDocument();
  });

  it('jumps to the first and last segment on Home and End', async () => {
    renderDialog({ members: ALL_MEMBERS });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    screen.getByRole('tab', { name: 'Members' }).focus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Staff' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Members' })).toHaveAttribute('aria-selected', 'true');
  });
});
