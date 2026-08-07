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
        staff: 'Staff',
        aria: 'Dashboard segments',
      },
      widgets: {
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
      <AddWidgetDialog initialSegment="staff" selectedKeys={selected as never} onSaved={onSaved} />
    </NextIntlClientProvider>,
  );
  return onSaved;
}

const ALL_STAFF = ['staff.sessions-per-trainer'];

describe('AddWidgetDialog', () => {
  beforeEach(() => {
    saveSegmentWidgetsAction.mockReset();
    saveSegmentWidgetsAction.mockResolvedValue({ ok: true, data: undefined });
  });

  it('says plainly that the layout is shared', async () => {
    renderDialog({ staff: ALL_STAFF });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    expect(
      screen.getByText('This layout is shared with everyone at your gym.'),
    ).toBeInTheDocument();
  });

  // "checks the widgets the segment currently shows" and "saves only the segments
  // whose selection changed" are DELETED, not skipped: both needed a second
  // checkbox to tick or a second segment to leave untouched, and `staff` is the
  // last configurable segment with exactly one widget. Restore them from git
  // history the moment the catalogue grows again.

  // Zero stored widgets would read as "never configured" and restore the whole
  // catalogue, quietly undoing the removal. With one widget left in the only
  // configurable segment this is no longer an edge case — it is what the picker
  // looks like every time it opens.
  it('will not let the last widget in a segment be unchecked', async () => {
    renderDialog({ staff: ALL_STAFF });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    const last = screen.getByRole('checkbox', { name: 'Sessions per trainer' });
    expect(last).toBeDisabled();
    expect(screen.getByText('Each segment keeps at least one widget.')).toBeInTheDocument();
  });

  // Saving an UNCHANGED selection: with one widget in the only segment there is
  // nothing left to tick, so this drives the save path as the picker now reaches
  // it. The dialog must survive the failure either way.
  it('reports a failed save and keeps the dialog open', async () => {
    saveSegmentWidgetsAction.mockResolvedValue({ ok: false, error: "Couldn't save your widgets." });
    renderDialog({ staff: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sessions per trainer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText("Couldn't save your widgets.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  // The tab bar announces role="tablist"/role="tab" — with one configurable
  // segment there is nothing to move WITHIN, so the roving-tabindex contract
  // degenerates to "the only tab is the tab stop". The arrow-key and Home/End
  // cases that pinned the rest of that contract are deleted rather than skipped;
  // restore them from git history when a second segment returns.
  it('keeps the only segment tab in the tab order', async () => {
    renderDialog({ staff: ALL_STAFF });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Staff' })).toHaveAttribute('tabindex', '0');
  });
});
