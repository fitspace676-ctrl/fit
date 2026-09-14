// @fit/admin — the default branch on the locations board (D3).
//
// The gym's default branch cannot be switched off: the API answers a deactivate
// with 409 LOCATION_IS_DEFAULT. The board says so before the click — the card
// carries a "Default branch" badge, its deactivate item is disabled with the
// reason attached — and every other active branch offers "Make default branch",
// which is how the flag moves and the old default becomes deactivatable.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import { locationHoursSchema, type AdminLocationRow } from '@fit/types';
import { navigationMock } from '@/test/next-navigation-mock';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ToastProvider } from '@/components/ui';
import { LocationsBoard } from './locations-board';

const actions = vi.hoisted(() => ({
  makeDefaultLocationAction: vi.fn(() => Promise.resolve({ ok: true, data: undefined })),
  setLocationActiveAction: vi.fn(() => Promise.resolve({ ok: true, data: { status: 'INACTIVE' } })),
}));

vi.mock('next/navigation', () => navigationMock.factory());

// The server actions pull `next/headers` in through the session helper.
vi.mock('./actions', () => actions);

function locationRow(overrides: Partial<AdminLocationRow> = {}): AdminLocationRow {
  return {
    id: 'loc-main',
    name: 'Main',
    address: '1 Rustaveli Ave',
    phone: null,
    photoUrl: null,
    amenities: [],
    hours: locationHoursSchema.parse({}),
    status: 'ACTIVE',
    isDefault: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const MAIN = locationRow({ isDefault: true });
const RIVERSIDE = locationRow({ id: 'loc-riverside', name: 'Riverside' });
const CLOSED = locationRow({ id: 'loc-closed', name: 'Closed Site', status: 'INACTIVE' });

function renderBoard(locations: AdminLocationRow[] = [MAIN, RIVERSIDE, CLOSED]) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ThemeProvider initial="light">
        <ToastProvider>
          <LocationsBoard locations={locations} canWrite canManage />
        </ToastProvider>
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
}

async function openMenu(name: string) {
  await userEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
}

beforeEach(() => {
  navigationMock.reset();
  actions.makeDefaultLocationAction.mockClear();
  actions.setLocationActiveAction.mockClear();
});

describe('LocationsBoard — the default branch', () => {
  it('badges only the default branch', () => {
    renderBoard();

    expect(screen.getAllByText('Default branch')).toHaveLength(1);
  });

  it('disables deactivating the default branch and says why', async () => {
    renderBoard();
    await openMenu('Main');

    const deactivate = screen.getByRole('menuitem', { name: 'Set as inactive' });
    expect((deactivate as HTMLButtonElement).disabled).toBe(true);
    expect(deactivate.getAttribute('title')).toBe(
      en.admin.locations.rowMenu.defaultCannotDeactivate,
    );
    expect(screen.queryByRole('menuitem', { name: 'Make default branch' })).toBeNull();

    await userEvent.click(deactivate);
    expect(actions.setLocationActiveAction).not.toHaveBeenCalled();
  });

  it('lets another active branch be deactivated or made the default', async () => {
    renderBoard();
    await openMenu('Riverside');

    const deactivate = screen.getByRole('menuitem', { name: 'Set as inactive' });
    expect((deactivate as HTMLButtonElement).disabled).toBe(false);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Make default branch' }));
    await waitFor(() =>
      expect(actions.makeDefaultLocationAction).toHaveBeenCalledWith('loc-riverside'),
    );
  });

  it('does not offer an inactive branch as the default', async () => {
    renderBoard();
    await openMenu('Closed Site');

    expect(screen.queryByRole('menuitem', { name: 'Make default branch' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Set as active' })).toBeDefined();
  });
});
