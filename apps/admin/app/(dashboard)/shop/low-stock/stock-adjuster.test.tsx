// @fit/admin — the stock adjuster's branch behaviour (Stage 4).
//
// `adjustStockSchema.locationId` is REQUIRED, and it is the only place in the
// multi-branch work where the branch is not optional-with-a-server-side-default.
// Everything pinned here follows from that one fact:
//
//  • a movement always names a branch, and the form will not submit without one;
//  • which branch is not always the operator's to choose — a surface already
//    scoped to a branch states it instead;
//  • and the count on screen only licenses an absolute recount when it came from
//    the shelf being written to. When it is a gym-wide roll-up the form records a
//    signed movement instead, because setting one branch's shelf to a number that
//    came from four is the untargeted write Stage 4 exists to eliminate.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider } from '@/components/ui';
import { StockAdjuster } from './stock-adjuster';

const mocks = vi.hoisted(() => ({
  locationId: { current: undefined as string | undefined },
  adjust: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

// The action pulls `next/headers` in through the session helper, which cannot
// run outside a request; the subject here is the body it is handed.
vi.mock('../actions', () => ({ adjustStockAction: mocks.adjust }));

vi.mock('@/components/active-location', () => ({
  useActiveLocation: () => ({
    active: mocks.locationId.current ?? 'all',
    locationId: mocks.locationId.current,
    locations: [
      { id: 'loc-riverside', name: 'Riverside' },
      { id: 'loc-downtown', name: 'Downtown' },
    ],
    setActive: vi.fn(),
  }),
}));

function renderAdjuster(props: Partial<React.ComponentProps<typeof StockAdjuster>> = {}) {
  return render(
    <ToastProvider>
      <StockAdjuster
        productId="p-1"
        productName="Whey protein"
        variantIndex={0}
        variantName="1kg"
        sku="WP-1KG"
        stock={4}
        stockLocationId={null}
        {...props}
      />
    </ToastProvider>,
  );
}

/** Open the dialog — every assertion below is about what is inside it. */
function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Adjust' }));
}

describe('StockAdjuster', () => {
  beforeEach(() => {
    mocks.locationId.current = undefined;
    mocks.adjust.mockReset();
    mocks.adjust.mockResolvedValue({ ok: true, data: { stock: 11 } });
  });

  it('states the branch, and posts an absolute count, when the caller owns one', () => {
    renderAdjuster({ stockLocationId: 'loc-riverside', stock: 4 });
    open();

    // Stated, not offered: a stocktake at the flagship must not be able to land on
    // the satellite's shelf by way of a select nobody meant to touch.
    expect(screen.queryByRole('combobox', { name: 'Branch' })).not.toBeInTheDocument();
    expect(screen.getByText('On hand at Riverside')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('New on-hand count'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply adjustment/ }));

    expect(mocks.adjust).toHaveBeenCalledWith('p-1', {
      locationId: 'loc-riverside',
      variantIndex: 0,
      setTo: 11,
      reason: 'RECEIVE',
      note: '',
    });
  });

  it('posts a signed delta when the count on screen is a gym-wide roll-up', () => {
    mocks.locationId.current = 'loc-downtown';
    renderAdjuster({ stockLocationId: null, stock: 40 });
    open();

    // The roll-up is labelled as one, and the field asks for a change rather than
    // a count — there is no shelf holding 40.
    expect(screen.getByText('On hand, all branches')).toBeInTheDocument();
    expect(screen.queryByLabelText('New on-hand count')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Change in units'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply adjustment/ }));

    expect(mocks.adjust).toHaveBeenCalledWith('p-1', {
      locationId: 'loc-downtown',
      variantIndex: 0,
      delta: 12,
      reason: 'RECEIVE',
      note: '',
    });
  });

  it('defaults the branch to the console’s active one', () => {
    mocks.locationId.current = 'loc-downtown';
    renderAdjuster({ stockLocationId: null });
    open();

    expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveValue('loc-downtown');
  });

  it('refuses to submit in All locations mode until a branch is chosen', () => {
    mocks.locationId.current = undefined;
    renderAdjuster({ stockLocationId: null, stock: 40 });
    open();

    // A real change, but nowhere to put it: the API would 400, and a disabled
    // button explains itself better than the round trip does.
    fireEvent.change(screen.getByLabelText('Change in units'), { target: { value: '12' } });
    const apply = screen.getByRole('button', { name: /Apply adjustment/ });
    expect(apply).toBeDisabled();

    fireEvent.click(apply);
    expect(mocks.adjust).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('combobox', { name: 'Branch' }), {
      target: { value: 'loc-riverside' },
    });
    expect(screen.getByRole('button', { name: /Apply adjustment/ })).toBeEnabled();
  });

  it('lets a delta go negative — a write-off is a movement downwards', () => {
    renderAdjuster({ stockLocationId: null, stock: 40 });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Decrease' }));
    expect(screen.getByLabelText('Change in units')).toHaveValue(-1);
  });

  it('never lets an absolute count go below zero', () => {
    renderAdjuster({ stockLocationId: 'loc-riverside', stock: 0 });
    open();
    // The stepper is disabled at the floor rather than clamping after the fact.
    expect(screen.getByRole('button', { name: 'Decrease' })).toBeDisabled();
    expect(screen.getByLabelText('New on-hand count')).toHaveValue(0);
  });

  it('shows a placeholder, not a blank, for a position with no count', () => {
    renderAdjuster({ stockLocationId: 'loc-riverside', stock: null });
    open();
    expect(screen.getByText('Nothing recorded')).toBeInTheDocument();
  });
});
