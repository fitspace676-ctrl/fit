// @fit/admin — the inventory filter bar's branch select (Stage 4).
//
// Same rule the members roster established: the page-level branch select and the
// header switcher are two ways into one URL param, so they are never on screen
// together. This control exists for the reader looking at every branch at once,
// and hands the axis to the switcher — which also persists the choice in a cookie
// — the moment one is picked.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import { navigationMock } from '@/test/next-navigation-mock';
import { InventoryFilters } from './inventory-filters';

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

function renderFilters(props: Partial<React.ComponentProps<typeof InventoryFilters>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <InventoryFilters search="" status="" tracked={false} {...props} />
    </NextIntlClientProvider>,
  );
}

describe('InventoryFilters', () => {
  beforeEach(() => {
    navigationMock.reset();
    mocks.locationId.current = undefined;
  });

  it('offers the branch select only in All locations mode', () => {
    renderFilters();
    expect(screen.getByRole('combobox', { name: 'Location' })).toBeInTheDocument();
  });

  it('unmounts the branch select once the chrome has narrowed to one', () => {
    mocks.locationId.current = 'loc-riverside';
    renderFilters();
    expect(screen.queryByRole('combobox', { name: 'Location' })).not.toBeInTheDocument();
  });

  it('writes the branch to the URL the header switcher owns, resetting the page', () => {
    navigationMock.setSearch('page=3&tracked=true');
    renderFilters({ tracked: true });

    fireEvent.change(screen.getByRole('combobox', { name: 'Location' }), {
      target: { value: 'loc-downtown' },
    });

    expect(navigationMock.replace).toHaveBeenCalledWith('/?tracked=true&locationId=loc-downtown');
  });

  it('renders the three filters the page has always parsed but never showed', () => {
    renderFilters({ search: 'whey', status: 'INACTIVE', tracked: true });
    expect(screen.getByLabelText('Search inventory by product name')).toHaveValue('whey');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('INACTIVE');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});
