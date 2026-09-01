// @fit/admin — the invoice roster's page-level branch filter (Stage 5).
//
// The control is a second way into the param the top-bar switcher owns, so the
// behaviour worth pinning is the hand-off: it renders only while the console is
// on "All locations", writes `?locationId=`, and disappears once the chrome names
// a branch. Same rule the members filter bar follows, and pinned here for the same
// reason — two live controls writing one param is how they end up disagreeing.
//
// The last case covers the navigation method: this bar shipped with `router.push`
// where every sibling replaces, which stacks a history entry per debounced
// keystroke burst.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { navigationMock } from '@/test/next-navigation-mock';
import { InvoiceFilters } from './invoice-filters';

// Hoisted: vitest lifts `vi.mock` above the imports, so the factory below runs
// while `./invoice-filters` is still being imported.
const mocks = vi.hoisted(() => ({ locationId: { current: undefined as string | undefined } }));

vi.mock('next/navigation', () => navigationMock.factory());

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

function renderFilters() {
  return render(<InvoiceFilters search="" type="" issuedFrom="" issuedTo="" />);
}

beforeEach(() => {
  navigationMock.reset();
  mocks.locationId.current = undefined;
});

describe('InvoiceFilters — the branch filter', () => {
  it('offers every branch in "All locations" mode and writes the URL param', async () => {
    const user = userEvent.setup();
    renderFilters();

    const select = screen.getByLabelText<HTMLSelectElement>('Filter by branch');
    expect(select.value).toBe('');

    await user.selectOptions(select, 'loc-downtown');

    // The same param the top-bar switcher owns, and page 1 — a narrower roster
    // must never leave the pager past the end of the result set.
    expect(navigationMock.replace).toHaveBeenCalledWith('/?locationId=loc-downtown');
  });

  it('is absent once a branch is active in the header switcher', () => {
    // The switcher wins because it is the one that also persists the choice in the
    // cookie; deselecting is done there, where the branch is actually named.
    mocks.locationId.current = 'loc-riverside';
    renderFilters();

    expect(screen.queryByLabelText('Filter by branch')).toBeNull();
    // The rest of the bar is untouched by the branch rule.
    expect(screen.getByLabelText('Filter by type')).toBeDefined();
  });

  it('replaces rather than pushes, and leaves the branch alone when clearing', async () => {
    // `replace` keeps the roster out of the back stack (every sibling filter bar in
    // the console does the same); preserving `locationId` through Clear keeps this
    // bar from silently undoing a branch choice made in the chrome.
    mocks.locationId.current = 'loc-downtown';
    navigationMock.setSearch('locationId=loc-downtown&type=CLASS&page=3');
    const user = userEvent.setup();
    render(<InvoiceFilters search="" type="CLASS" issuedFrom="" issuedTo="" />);

    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(navigationMock.push).not.toHaveBeenCalled();
    expect(navigationMock.replace).toHaveBeenCalledWith('/?locationId=loc-downtown');
  });
});
