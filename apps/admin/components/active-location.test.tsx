// @fit/admin — what actually happens when a branch is chosen.
//
// Three things have to happen together or the filter is inert: the cookie has to
// change (so the NEXT page, whose links carry no param, is still scoped), the URL
// has to change (so the view is shareable and the back button restores it), and
// the server tree has to refetch (so the page on screen redraws for the new
// branch). Any one of them missing looks fine in a screenshot.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { navigationMock } from '@/test/next-navigation-mock';
import { ACTIVE_LOCATION_COOKIE } from '@/lib/active-location';
import { ActiveLocationProvider, useActiveLocation } from './active-location';

vi.mock('next/navigation', () => navigationMock.factory());

const LOCATIONS = [
  { id: 'loc-downtown', name: 'Downtown' },
  { id: 'loc-harbour', name: 'Harbour' },
];

/** Bare consumer — the switcher's chrome is `top-bar.test.tsx`'s subject. */
function Probe() {
  const { active, locationId, setActive } = useActiveLocation();
  return (
    <>
      <output data-testid="active">{active}</output>
      <output data-testid="filter">{locationId ?? '(none)'}</output>
      <button type="button" onClick={() => setActive('loc-harbour')}>
        pick harbour
      </button>
      <button type="button" onClick={() => setActive('all')}>
        pick all
      </button>
    </>
  );
}

function renderProvider(initial: string) {
  render(
    <ActiveLocationProvider initial={initial} locations={LOCATIONS}>
      <Probe />
    </ActiveLocationProvider>,
  );
}

/** Read one cookie back off the jsdom document. */
function cookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

describe('ActiveLocationProvider', () => {
  beforeEach(() => {
    navigationMock.reset();
    document.cookie = `${ACTIVE_LOCATION_COOKIE}=; path=/; max-age=0`;
  });

  it('renders the server-seeded branch on the first frame', () => {
    renderProvider('loc-downtown');
    expect(screen.getByTestId('active')).toHaveTextContent('loc-downtown');
    expect(screen.getByTestId('filter')).toHaveTextContent('loc-downtown');
  });

  it('lets ?locationId= override the seeded cookie value', () => {
    navigationMock.setSearch('locationId=loc-harbour');
    renderProvider('loc-downtown');
    expect(screen.getByTestId('active')).toHaveTextContent('loc-harbour');
  });

  it('degrades a ?locationId= naming a branch this gym does not have', () => {
    navigationMock.setSearch('locationId=loc-closed');
    renderProvider('loc-downtown');
    expect(screen.getByTestId('active')).toHaveTextContent('all');
  });

  it('normalises "all locations" to no API filter', () => {
    renderProvider('all');
    expect(screen.getByTestId('filter')).toHaveTextContent('(none)');
  });

  it('persists a chosen branch to the cookie, the URL and the server tree', async () => {
    navigationMock.setSearch('status=ACTIVE');
    renderProvider('all');

    await userEvent.click(screen.getByRole('button', { name: 'pick harbour' }));

    expect(cookie(ACTIVE_LOCATION_COOKIE)).toBe('loc-harbour');
    // Every other param is preserved — the branch is one filter among several.
    expect(navigationMock.replace).toHaveBeenCalledWith('/?status=ACTIVE&locationId=loc-harbour');
    expect(navigationMock.refresh).toHaveBeenCalled();
  });

  it('shows the new branch immediately, without waiting for the navigation', async () => {
    renderProvider('all');
    await userEvent.click(screen.getByRole('button', { name: 'pick harbour' }));
    // `useSearchParams()` still reports the old URL here — the router mock never
    // navigates — so this is exactly the in-flight frame, and the control has to
    // have moved already.
    expect(screen.getByTestId('active')).toHaveTextContent('loc-harbour');
  });

  it('drops the param entirely for "all locations" rather than writing locationId=all', async () => {
    navigationMock.setSearch('locationId=loc-harbour');
    renderProvider('loc-harbour');

    await userEvent.click(screen.getByRole('button', { name: 'pick all' }));

    expect(cookie(ACTIVE_LOCATION_COOKIE)).toBe('all');
    expect(navigationMock.replace).toHaveBeenCalledWith('/');
    // The URL is unchanged in the no-other-params case, so `replace` alone would
    // be a no-op navigation — only the explicit refresh re-reads the cookie.
    expect(navigationMock.refresh).toHaveBeenCalled();
    expect(screen.getByTestId('active')).toHaveTextContent('all');
  });
});

describe('useActiveLocation outside the console layout', () => {
  it('reports all locations with an inert setter rather than throwing', () => {
    render(<Probe />);
    expect(screen.getByTestId('active')).toHaveTextContent('all');
    expect(screen.getByTestId('filter')).toHaveTextContent('(none)');
  });
});
