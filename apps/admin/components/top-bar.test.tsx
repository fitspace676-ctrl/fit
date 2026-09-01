// @fit/admin — the top bar's branch switcher.
//
// The switcher shipped with no coverage at all (`admin-shell.test.tsx` stubs the
// whole bar out), which is part of how it stayed inert for so long. What is
// pinned here is the bar's half of the contract only: the roster it draws, the
// order it draws it in, and that a choice is handed to the provider rather than
// kept locally. Where that choice then goes — cookie, URL, RSC refetch — is
// `active-location.test.tsx`'s subject.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { navigationMock } from '@/test/next-navigation-mock';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { TopBar } from './top-bar';

// Hoisted so the module factories below can close over them: vitest lifts
// `vi.mock` above the imports, and the factory runs while `./top-bar` is being
// imported — before any plain `const` in this file has been initialised.
const mocks = vi.hoisted(() => ({
  setActive: vi.fn(),
  active: { current: 'all' },
  /** Whether this operator's role works gym-wide — see the branch-scope specs below. */
  canSelectAll: { current: true },
}));

vi.mock('next/navigation', () => navigationMock.factory());

// The bar's session menu fetches `/api/session` on mount; there is no session
// route under vitest and the menu is not what this spec is about.
vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({ user: null, isLoading: false }),
}));

vi.mock('./active-location', () => ({
  useActiveLocation: () => ({
    active: mocks.active.current,
    locationId: mocks.active.current === 'all' ? undefined : mocks.active.current,
    locations: [],
    canSelectAll: mocks.canSelectAll.current,
    setActive: mocks.setActive,
  }),
}));

const messages = {
  admin: {
    common: {
      consoleName: 'Fit Console',
      openNav: 'Open navigation',
      locationLabel: 'Location',
      allLocations: 'All locations',
      switchToLight: 'Switch to light',
      switchToDark: 'Switch to dark',
      profile: 'Profile',
      settings: 'Settings',
      signOut: 'Sign out',
      language: { label: 'Language' },
    },
  },
};

const LOCATIONS = [
  { id: 'loc-downtown', name: 'Downtown' },
  { id: 'loc-harbour', name: 'Harbour' },
];

function renderBar(locations = LOCATIONS) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ThemeProvider initial="dark">
        <TopBar locations={locations} />
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
}

describe('TopBar branch switcher', () => {
  beforeEach(() => {
    navigationMock.reset();
    mocks.setActive.mockReset();
    mocks.active.current = 'all';
    mocks.canSelectAll.current = true;
  });

  it('renders no switcher for a gym with no locations', () => {
    // A single-site gym has nothing to filter by, so the chrome stays clean —
    // and a bar showing only "All locations" would imply there are others.
    renderBar([]);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('lists "All locations" first, then the gym\'s branches in roster order', () => {
    renderBar();
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Location' });
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'All locations',
      'Downtown',
      'Harbour',
    ]);
    expect([...select.options].map((option) => option.value)).toEqual([
      'all',
      'loc-downtown',
      'loc-harbour',
    ]);
  });

  it('shows the branch the console is already scoped to', () => {
    // Straight from the provider, which the server seeded from the cookie — the
    // old `useEffect` restore painted "All locations" for a frame first.
    mocks.active.current = 'loc-harbour';
    renderBar();
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Location' }).value).toBe(
      'loc-harbour',
    );
  });

  it('hands a chosen branch to the provider instead of keeping it locally', async () => {
    renderBar();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Location' }),
      'loc-downtown',
    );
    expect(mocks.setActive).toHaveBeenCalledWith('loc-downtown');
  });

  it('hands the "all" sentinel over the same path', async () => {
    mocks.active.current = 'loc-downtown';
    renderBar();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Location' }), 'all');
    expect(mocks.setActive).toHaveBeenCalledWith('all');
  });
});

describe('TopBar branch switcher, for a branch-scoped role', () => {
  // A role whose branch scope is `assigned` may work only at the branches it is
  // rostered to. "All locations" is not one of those branches — it is the absence
  // of the restriction — so the option must not be on the list at all.
  //
  // Not merely disabled: a greyed row still announces that a gym-wide view exists
  // and that this person is being kept out of it, and a `<select>` whose chosen
  // value snaps back reads as a broken control rather than as a policy. The
  // roster it does list has already been narrowed by the console layout, so every
  // option here is one they hold.
  beforeEach(() => {
    navigationMock.reset();
    mocks.setActive.mockReset();
    mocks.canSelectAll.current = false;
    mocks.active.current = 'loc-harbour';
  });

  it('offers no "All locations" option', () => {
    renderBar();
    const labels = screen
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(labels).toEqual(['Downtown', 'Harbour']);
    expect(labels).not.toContain('All locations');
  });

  it('still draws the branches the operator does hold', () => {
    renderBar();
    expect(screen.getByRole('combobox')).toHaveValue('loc-harbour');
  });
});
