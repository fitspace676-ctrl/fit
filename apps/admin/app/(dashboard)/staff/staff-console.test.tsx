// @fit/admin — the staff console's branch filter (Stage 6).
//
// This screen asks TWO branch questions and answers them from two different
// fields, and getting them confused is the whole failure mode Stage 6 exists to
// prevent. The roster asks "who can work here" and reads the staff member's
// `LocationStaff` assignments (`assignedLocationIds` on the wire), which overlap:
// a coach covering both sites is on both rosters. The "Who's Working Now" card
// asks "who is behind this door right now" and reads the SHIFT's own branch,
// because being allowed to work somewhere is not the same as standing there on a
// Tuesday morning.
//
// Both properties are pinned below, along with the two states neither may adopt:
// a person or shift with no branch, and a shift carrying a surviving free-text
// label that matched no branch of this gym.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import type {
  GymStaffDirectorySettings,
  ListStaffRolesResponse,
  StaffMember,
  WorkingNowRow,
} from '@fit/types';
import { navigationMock } from '@/test/next-navigation-mock';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ToastProvider } from '@/components/ui';
import { StaffConsole } from './staff-console';

// Hoisted: vitest lifts `vi.mock` above the imports, so the factory below runs
// while `./staff-console` is still being imported.
const mocks = vi.hoisted(() => ({ locationId: { current: undefined as string | undefined } }));

vi.mock('next/navigation', () => navigationMock.factory());

// The console's drawers pull in server actions, which reach `next/headers`
// through the session helper and are not this spec's subject.
vi.mock('./actions', () => ({
  createStaffAction: vi.fn(),
  removeStaffAction: vi.fn(),
  updateStaffProfileAction: vi.fn(),
  updateStaffRoleAction: vi.fn(),
  inviteStaffAction: vi.fn(),
  revokeInviteAction: vi.fn(),
}));
vi.mock('./depth-actions', () => ({ loadStaffScheduleAction: vi.fn() }));

vi.mock('@/components/active-location', () => ({
  useActiveLocation: () => ({
    active: mocks.locationId.current ?? 'all',
    locationId: mocks.locationId.current,
    locations: [
      { id: 'loc-vake', name: 'Vake' },
      { id: 'loc-saburtalo', name: 'Saburtalo' },
    ],
    setActive: vi.fn(),
  }),
}));

/** One roster row; only the fields the filter and the cells read are meaningful. */
function staffMember(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    id: 'gm-1',
    userId: 'u-1',
    name: 'Nino Beridze',
    firstName: 'Nino',
    lastName: 'Beridze',
    email: 'nino@example.com',
    phone: null,
    role: 'TRAINER',
    status: 'ACTIVE',
    assignedLocationIds: ['loc-vake'],
    locations: ['Vake'],
    joinedAt: '2026-01-01T00:00:00.000Z',
    trainerId: null,
    ...overrides,
  };
}

/** One "on shift now" row. */
function workingNowRow(overrides: Partial<WorkingNowRow> = {}): WorkingNowRow {
  return {
    staffId: 'gm-1',
    name: 'Nino Beridze',
    role: 'TRAINER',
    startTime: '09:00',
    endTime: '17:00',
    locationId: 'loc-vake',
    locationName: 'Vake',
    unresolvedLocation: null,
    ...overrides,
  };
}

/** Every optional column and block on, so nothing under test is hidden by settings. */
const DISPLAY: GymStaffDirectorySettings = {
  lastName: true,
  role: true,
  status: true,
  location: true,
  email: true,
  phone: true,
  joined: true,
  whosWorking: true,
  roles: true,
};

const ROLES: ListStaffRolesResponse = { roles: [] };

function renderConsole({
  staff = [staffMember()],
  workingNow = [] as WorkingNowRow[],
}: { staff?: StaffMember[]; workingNow?: WorkingNowRow[] } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ThemeProvider initial="light">
        <ToastProvider>
          <StaffConsole
            staff={staff}
            currentUserId={null}
            canManage={false}
            roles={ROLES}
            workingNow={workingNow}
            locations={[
              { id: 'loc-vake', name: 'Vake' },
              { id: 'loc-saburtalo', name: 'Saburtalo' },
            ]}
            display={DISPLAY}
          />
        </ToastProvider>
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
}

describe('StaffConsole branch filter', () => {
  beforeEach(() => {
    mocks.locationId.current = undefined;
    navigationMock.reset();
  });

  describe('the roster — "who can work here"', () => {
    const vakeOnly = staffMember({ id: 'gm-1', name: 'Nino Beridze' });
    const saburtaloOnly = staffMember({
      id: 'gm-2',
      name: 'Lasha Kapanadze',
      assignedLocationIds: ['loc-saburtalo'],
      locations: ['Saburtalo'],
    });
    const bothSites = staffMember({
      id: 'gm-3',
      name: 'Mariam Tsiklauri',
      assignedLocationIds: ['loc-vake', 'loc-saburtalo'],
      locations: ['Vake', 'Saburtalo'],
    });
    const unassigned = staffMember({
      id: 'gm-4',
      name: 'Giorgi Kvaratskhelia',
      assignedLocationIds: [],
      locations: [],
    });
    const everyone = [vakeOnly, saburtaloOnly, bothSites, unassigned];

    it('shows the whole roster with no branch selected', () => {
      renderConsole({ staff: everyone });
      for (const member of everyone) {
        expect(screen.getByText(member.name.split(' ')[0]!)).toBeTruthy();
      }
    });

    // The overlap property, stated once in the schema and load-bearing for every
    // figure on this page: a coach who covers two sites is on BOTH rosters, so
    // adding the branches up exceeds the gym-wide roster by exactly the number of
    // two-site staff. Correct for a capability; a bug for a head-count, which is
    // why nothing here reads `GymMember.locationId`.
    it('puts a two-site coach on both branches, so the branches sum to more than the gym', () => {
      mocks.locationId.current = 'loc-vake';
      const vake = renderConsole({ staff: everyone });
      expect(screen.getByText('Nino')).toBeTruthy();
      expect(screen.getByText('Mariam')).toBeTruthy();
      expect(screen.queryByText('Lasha')).toBeNull();
      vake.unmount();

      mocks.locationId.current = 'loc-saburtalo';
      renderConsole({ staff: everyone });
      expect(screen.getByText('Lasha')).toBeTruthy();
      expect(screen.getByText('Mariam')).toBeTruthy();
      expect(screen.queryByText('Nino')).toBeNull();

      // 2 + 2 > 4 - 1 unassigned = 3. Mariam is counted twice, on purpose.
    });

    // "We do not know where this person works" is a state the Add form accepts on
    // purpose, and no branch may adopt it.
    it('hides a staff member with no assignments from every branch', () => {
      mocks.locationId.current = 'loc-vake';
      renderConsole({ staff: everyone });
      expect(screen.queryByText('Giorgi')).toBeNull();
    });

    // The branch column is a SET, so unlike every other branch column in the
    // console it survives a branch filter: the second name is exactly why this
    // person is only half available here.
    it('keeps the multi-branch column under a filter, listing every branch', () => {
      mocks.locationId.current = 'loc-vake';
      renderConsole({ staff: [bothSites] });
      expect(screen.getByText('Vake, Saburtalo')).toBeTruthy();
    });
  });

  describe('"Who\'s Working Now" — "who is behind this door"', () => {
    it("narrows on the shift's own branch, not the person's roster", () => {
      // Rostered at Vake (see `staffMember`), but working a Saburtalo shift today.
      mocks.locationId.current = 'loc-vake';
      renderConsole({
        staff: [staffMember()],
        workingNow: [workingNowRow({ locationId: 'loc-saburtalo', locationName: 'Saburtalo' })],
      });
      expect(screen.getByText(en.admin.staff.workingNow.empty)).toBeTruthy();
    });

    it('keeps a shift at the selected branch', () => {
      mocks.locationId.current = 'loc-vake';
      renderConsole({ workingNow: [workingNowRow()] });
      expect(screen.getByText('09:00 – 17:00')).toBeTruthy();
    });

    // Nothing knows where an unattributed shift is, so it shows gym-wide and under
    // no branch — the same rule the roster applies to an unassigned person.
    it('drops an unattributed shift under a filter and keeps it gym-wide', () => {
      const shift = workingNowRow({ locationId: null, locationName: null });

      // Empty roster, so the only dash on screen is the card's own placeholder.
      const all = renderConsole({ staff: [], workingNow: [shift] });
      expect(screen.getByText('09:00 – 17:00')).toBeTruthy();
      // No branch, so the placeholder rather than a blank.
      expect(screen.getByText('-')).toBeTruthy();
      all.unmount();

      mocks.locationId.current = 'loc-vake';
      renderConsole({ staff: [], workingNow: [shift] });
      expect(screen.getByText(en.admin.staff.workingNow.empty)).toBeTruthy();
    });

    // A surviving free-text label means precisely "this text named no branch of
    // this gym". It is an operator's queue item, never a branch: it must not
    // satisfy a filter, and it must not be printed beside a name as if it were the
    // door this person is standing at.
    it('never treats a surviving free-text label as a branch', () => {
      const shift = workingNowRow({
        locationId: null,
        locationName: null,
        unresolvedLocation: 'Main Floor',
      });

      const all = renderConsole({ workingNow: [shift] });
      expect(screen.queryByText('Main Floor')).toBeNull();
      all.unmount();

      mocks.locationId.current = 'loc-vake';
      renderConsole({ workingNow: [shift] });
      expect(screen.getByText(en.admin.staff.workingNow.empty)).toBeTruthy();
    });

    // The branch name earns its place only where the card mixes two sites' desks.
    it('names each branch gym-wide and drops the name once one is selected', () => {
      const all = renderConsole({ workingNow: [workingNowRow()] });
      expect(screen.getAllByText('Vake').length).toBeGreaterThan(0);
      all.unmount();

      mocks.locationId.current = 'loc-vake';
      renderConsole({ workingNow: [workingNowRow()], staff: [] });
      // The chrome already names the branch; the tile must not repeat it.
      expect(screen.queryByText('Vake')).toBeNull();
    });
  });

  describe('the branch hand-off control', () => {
    it('is offered while the console shows every branch', () => {
      renderConsole();
      expect(screen.getByLabelText(en.admin.common.locationLabel)).toBeTruthy();
    });

    // Two live controls writing one param is how they end up disagreeing. Once the
    // switcher owns a branch it also names it, so this one steps aside.
    it('disappears once the header switcher owns a branch', () => {
      mocks.locationId.current = 'loc-vake';
      renderConsole();
      expect(screen.queryByLabelText(en.admin.common.locationLabel)).toBeNull();
    });
  });
});
