// @fit/admin — the roster's branch column and branch filter (Stage 2).
//
// Both are conditional on the console's active branch, and both conditions are
// the same one: they exist to help a reader who is looking at every branch at
// once, and are noise (column) or a duplicate control (filter) as soon as the
// chrome has already narrowed to one. That is the behaviour pinned here, along
// with the placeholder a member with no branch renders — the roster must never
// show a blank cell where a fact is simply missing.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import type { MemberPlanMix, MemberRow, MemberTabCounts } from '@fit/types';
import { navigationMock } from '@/test/next-navigation-mock';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ToastProvider } from '@/components/ui';
import { MembersTable } from './members-table';

// Hoisted: vitest lifts `vi.mock` above the imports, so the factory below runs
// while `./members-table` is still being imported.
const mocks = vi.hoisted(() => ({ locationId: { current: undefined as string | undefined } }));

vi.mock('next/navigation', () => navigationMock.factory());

// The table imports the roster's server actions (trash / bulk export); those pull
// `next/headers` in through the session helper and are not this spec's subject.
vi.mock('./actions', () => ({
  bulkExportMembersAction: vi.fn(),
  setMemberTrashedAction: vi.fn(),
}));

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

/** One roster row; only the fields the cells under test read are meaningful. */
function memberRow(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: 'm-1',
    name: 'Ana Beridze',
    email: 'ana@example.com',
    phone: null,
    status: 'ACTIVE',
    kind: 'MEMBER',
    kindOverride: null,
    planName: null,
    plan: null,
    locationName: 'Riverside',
    lastVisitAt: null,
    nextBillingAt: null,
    billingState: 'none',
    outstanding: null,
    deletedAt: null,
    ...overrides,
  };
}

const PLAN_MIX: MemberPlanMix = { total: 0, plans: [] };
const COUNTS: MemberTabCounts = {
  all: 1,
  member: 1,
  guest: 0,
  inactive: 0,
  active: 1,
  frozen: 0,
  trial: 0,
  expired: 0,
  trash: 0,
};

function renderRoster(members: MemberRow[] = [memberRow()]) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ThemeProvider initial="light">
        <ToastProvider>
          <MembersTable
            members={members}
            total={members.length}
            page={1}
            limit={20}
            planMix={PLAN_MIX}
            counts={COUNTS}
            sort="name"
            dir="asc"
            search=""
            kind=""
            view="active"
            frozen={false}
            planId=""
            canWrite
          />
        </ToastProvider>
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  navigationMock.reset();
  mocks.locationId.current = undefined;
});

describe('MembersTable — the branch column', () => {
  it('shows the branch in "All locations" mode', () => {
    renderRoster();

    expect(screen.getByRole('columnheader', { name: 'Location' })).toBeDefined();
    expect(screen.getByRole('cell', { name: 'Riverside' })).toBeDefined();
  });

  it('renders a dash, not a blank cell, for a member with no branch', () => {
    // Until the backfill lands and the column is tightened to NOT NULL, a member
    // with no branch is a real state — and an empty cell reads as a broken render.
    // The neighbouring cells are given real values so the only dash on the row is
    // the branch's — "last visit" and "next billing" both use the same placeholder.
    renderRoster([
      memberRow({
        locationName: null,
        lastVisitAt: new Date().toISOString(),
        billingState: 'paused',
      }),
    ]);

    expect(screen.getByRole('cell', { name: '-' })).toBeDefined();
  });

  it('drops the column once the console is scoped to one branch', () => {
    // Every row would repeat the branch the chrome already names, so the column is
    // a constant taking width from the plan and billing figures beside it.
    mocks.locationId.current = 'loc-riverside';
    renderRoster();

    expect(screen.queryByRole('columnheader', { name: 'Location' })).toBeNull();
    expect(screen.queryByRole('cell', { name: 'Riverside' })).toBeNull();
  });
});

describe('MembersTable — the branch filter', () => {
  it('offers every branch in "All locations" mode and writes the URL param', async () => {
    const user = userEvent.setup();
    renderRoster();

    await user.click(screen.getByRole('button', { name: 'Filter' }));
    const select = screen.getByLabelText<HTMLSelectElement>('Location');
    expect(select.value).toBe('');

    await user.selectOptions(select, 'loc-downtown');

    // The same param the top-bar switcher owns, and page 1 — a narrower roster
    // must never leave the pager past the end of the result set.
    expect(navigationMock.replace).toHaveBeenCalledWith('/?locationId=loc-downtown');
  });

  it('is absent once a branch is active in the header switcher', async () => {
    // Two controls writing one param is how they end up disagreeing; the switcher
    // wins because it is the one that also persists the choice in the cookie.
    mocks.locationId.current = 'loc-riverside';
    const user = userEvent.setup();
    renderRoster();

    await user.click(screen.getByRole('button', { name: 'Filter' }));

    expect(screen.queryByLabelText('Location')).toBeNull();
    // The status and plan filters are untouched by the branch rule.
    expect(screen.getByLabelText('Status')).toBeDefined();
  });
});
