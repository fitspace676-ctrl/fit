'use client';

import { useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type {
  GymStaffDirectorySettings,
  ListStaffRolesResponse,
  StaffDirectoryField,
  StaffMember,
  StaffRole,
  WorkingNowRow,
} from '@fit/types';
import { Button, Drawer, SegmentedControl, SelectField } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { useActiveLocation } from '@/components/active-location';
import { LOCATION_PARAM } from '@/lib/active-location';
import { STAFF_ROLES } from './role-meta';
import { StaffTable } from './staff-table';
import { AddStaffDrawer } from './add-staff-drawer';
import { StaffProfileDrawer } from './staff-profile-drawer';
import { InviteModal } from './invite-modal';
import { RolesPanel } from './roles-panel';
import { RolesCards } from './roles-cards';
import { WhosWorkingCard } from './whos-working-card';

/** The staff-console top-level tabs. The roster is always one; the rest are opt-in. */
type ConsoleTab = 'staff' | 'roles';

/**
 * The tabs a gym may switch on in Settings → Staff page, in the order they are
 * offered there. The roster tab is deliberately absent — it is the page, not an
 * option, and a console with no way to see the staff list would be a bug.
 */
const OPTIONAL_TABS: {
  tab: ConsoleTab;
  field: StaffDirectoryField;
  labelKey: string;
}[] = [{ tab: 'roles', field: 'roles', labelKey: 'tabs.rolesPermissions' }];

const styles = stylex.create({
  /** Icon size inside a kit `Button`. */
  kitGlyph: { height: '1rem', width: '1rem' },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  crumbIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  crumbCurrent: {
    color: 'var(--color-text-primary)',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontSize: {
      default: '1.5rem',
      '@media (min-width: 640px)': '1.875rem',
    },
    fontWeight: 800,
    letterSpacing: '-0.025em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  headerActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  filterRow: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 768px)': 'row',
    },
    alignItems: {
      default: 'stretch',
      '@media (min-width: 768px)': 'center',
    },
    gap: '0.75rem',
  },
  searchWrap: {
    position: 'relative',
    flex: {
      default: 'none',
      '@media (min-width: 768px)': 1,
    },
    maxWidth: {
      default: 'none',
      '@media (min-width: 768px)': '26rem',
    },
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  searchIcon: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    pointerEvents: 'none',
    color: 'var(--color-icon-secondary)',
  },
  searchIconSvg: {
    height: '1rem',
    width: '1rem',
  },
  searchInput: {
    height: '2.75rem',
    width: '100%',
    paddingLeft: '2.25rem',
    paddingRight: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
  },
  roleSelect: {
    width: {
      default: '100%',
      '@media (min-width: 768px)': '12rem',
    },
  },
  spacer: {
    display: {
      default: 'none',
      '@media (min-width: 768px)': 'block',
    },
    flex: 1,
  },
});

/**
 * The staff console shell (Stage 1) — rebuilt to the reference staff artboard.
 * Renders the header (title + a "Manage Roles" action that opens a drawer), the
 * "Who's Working Now" card, and two tabs: the roster
 * ("Staff List", with a role filter, search and "Add Staff") and the role cards
 * ("Roles & Permissions"). The roster and role matrix are server-rendered and
 * passed in; this component owns only view state (active tab, search, role
 * filter, and which modal/drawer is open).
 */
export function StaffConsole({
  staff,
  currentUserId,
  canManage,
  roles,
  workingNow,
  locations,
  display,
}: {
  staff: StaffMember[];
  currentUserId: string | null;
  canManage: boolean;
  roles: ListStaffRolesResponse;
  workingNow: WorkingNowRow[];
  /** The gym's live locations, offered as assignable-location chips in the Add drawer. */
  locations: { id: string; name: string }[];
  /** What this gym shows — Settings → Staff page. */
  display: GymStaffDirectorySettings;
}) {
  const t = useTranslations('admin.staff');
  const tCommon = useTranslations('admin.common');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // THE BRANCH FILTER IS APPLIED HERE, IN THE BROWSER — the only screen in the
  // console that does it this way, and deliberately.
  //
  // Every other wired page parses `searchParams` server-side and hands the branch
  // to a paginated fetch, because it has to: one page of members or invoices is a
  // window onto a much longer list, so filtering the window in the browser would
  // filter thirty rows out of nine hundred and the pager would count the wrong
  // total. `/staff` has neither problem. `GET /staff` is unpaginated — the roster
  // arrives whole — and this component already filters it by role and by search
  // text on exactly these terms.
  //
  // It is also not an approximation of the server filter. `listStaffQuerySchema`'s
  // `locationId` narrows through the `LocationStaff` join table, and Stage 6
  // re-pointed `StaffMember.assignedLocationIds` at that same table (the wire shape
  // was kept identical on purpose, so the console did not have to change with the
  // schema). So `assignedLocationIds.includes(branch)` below IS the server's
  // predicate, evaluated one hop later, with no extra round trip.
  //
  // `branchOptions`, not the `locations` prop: the prop is the gym's live branches
  // as the Add / Edit forms offer them, while these are the ones the header
  // switcher lists — and this control exists to hand that switcher its value, so it
  // must offer exactly what the switcher can adopt.
  const { locationId: activeLocationId, locations: branchOptions } = useActiveLocation();

  const [tab, setTab] = useState<ConsoleTab>('staff');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<StaffRole | ''>('');
  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [manageRolesOpen, setManageRolesOpen] = useState(false);
  const [profileMember, setProfileMember] = useState<StaffMember | null>(null);

  // The per-role tallies on the Roles tab, narrowed by branch but NOT by the
  // roster's search / role controls: those two belong to the list on the other tab,
  // and a role card reading "0 staff" because someone typed a name in a box they
  // cannot see would be a lie. The branch is different — it is the console-wide
  // axis the chrome names, so a card that ignored it would disagree with the roster
  // beside it.
  //
  // Under a branch these are "people who can work here, by role", not a per-branch
  // head-count: a two-site coach is counted at both sites, so the cards sum to more
  // than the payroll. The roster they mirror overlaps the same way.
  const roleCounts = useMemo(() => {
    const counts: Partial<Record<StaffRole, number>> = {};
    for (const member of staff) {
      if (
        activeLocationId !== undefined &&
        !member.assignedLocationIds.includes(activeLocationId)
      ) {
        continue;
      }
      counts[member.role] = (counts[member.role] ?? 0) + 1;
    }
    return counts;
  }, [staff, activeLocationId]);

  const tabItems = useMemo<{ value: ConsoleTab; label: string }[]>(
    () => [
      { value: 'staff', label: t('tabs.staffList') },
      ...OPTIONAL_TABS.filter((option) => display[option.field]).map((option) => ({
        value: option.tab,
        label: t(option.labelKey),
      })),
    ],
    [display, t],
  );

  // Derived rather than synced: a gym can switch off the tab a staffer is sitting
  // on, and an effect would leave one render pointing at a tab that no longer
  // exists. Falling back to the roster keeps the page whole in that frame.
  const activeTab = tabItems.some((item) => item.value === tab) ? tab : 'staff';

  const visibleStaff = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return staff.filter((member) => {
      const matchesRole = roleFilter === '' || member.role === roleFilter;
      const matchesSearch =
        needle === '' ||
        member.name.toLowerCase().includes(needle) ||
        member.email.toLowerCase().includes(needle);
      // "Who can work here" — the roster assignments, NOT `GymMember.locationId`.
      // The staff row carries that column too, where it means the person's base
      // branch, and it partitions the payroll: reading it here would answer a
      // head-count question with a roster list. A coach who covers two sites is on
      // both branches' rosters, so per-branch roster lengths sum to MORE than this
      // gym-wide list — correct for a capability, and a bug for a total.
      //
      // Someone with no assignments at all reaches no branch and is visible only in
      // "All locations". Nothing adopts them: an empty selection means "we do not
      // know where this person works", which is a state the Add form accepts on
      // purpose (see `createStaffSchema`).
      const matchesLocation =
        activeLocationId === undefined || member.assignedLocationIds.includes(activeLocationId);
      return matchesRole && matchesSearch && matchesLocation;
    });
  }, [staff, query, roleFilter, activeLocationId]);

  // "Who is behind THIS door right now" — a different question from the roster
  // above, and read off a different field on purpose.
  //
  // A shift is an event at a place, so this narrows on `ShiftSlot.locationId`
  // (carried through as `WorkingNowRow.locationId`). It is emphatically not the
  // roster hop: "Nino can work at Saburtalo" does not put her behind that desk on a
  // Tuesday morning. A shift with no branch is absent under a filter and present
  // without one — somebody is rostered somewhere unrecorded, and no branch may
  // claim them.
  //
  // `unresolvedLocation` plays no part. A surviving free-text label means "this
  // text named no branch of this gym"; it can never satisfy a branch filter, and
  // treating it as one would resurrect exactly the ambiguity Stage 6 removed.
  const onShiftNow = useMemo(
    () =>
      activeLocationId === undefined
        ? workingNow
        : workingNow.filter((shift) => shift.locationId === activeLocationId),
    [workingNow, activeLocationId],
  );

  // A second way into the param the top-bar switcher owns, offered only while the
  // console is on "All locations": picking a branch here hands the axis to the
  // switcher, which then names it and unmounts this control. Two live controls
  // writing one param is how they end up disagreeing, and the switcher is the one
  // that also persists the choice in the cookie. Same rule the members and invoice
  // filter bars follow.
  const showBranchFilter = activeLocationId === undefined && branchOptions.length > 0;

  function commitBranch(value: string): void {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(LOCATION_PARAM, value);
    } else {
      params.delete(LOCATION_PARAM);
    }
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  return (
    <div {...stylex.props(styles.stack)}>
      <nav aria-label={t('breadcrumb.label')} {...stylex.props(styles.breadcrumb)}>
        <span>{t('breadcrumb.home')}</span>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <span {...stylex.props(styles.crumbCurrent)}>{t('breadcrumb.staff')}</span>
      </nav>

      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headline)}>
          <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
          <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
        </div>
        {canManage ? (
          <div {...stylex.props(styles.headerActions)}>
            <Button
              variant="secondary"
              size="card"
              onClick={() => setManageRolesOpen(true)}
              icon={<Icon name="shield" {...stylex.props(styles.kitGlyph)} />}
              label={t('manageRoles')}
            />
          </div>
        ) : null}
      </header>

      {display.whosWorking ? (
        <WhosWorkingCard shifts={onShiftNow} showBranch={activeLocationId === undefined} />
      ) : null}

      {/* A lone "Staff List" tab is chrome around nothing — drop the strip. */}
      {tabItems.length > 1 ? (
        <SegmentedControl
          label={t('title')}
          value={activeTab}
          onChange={setTab}
          options={tabItems}
        />
      ) : null}

      {activeTab === 'staff' ? (
        <>
          <div {...stylex.props(styles.filterRow)}>
            <div {...stylex.props(styles.searchWrap)}>
              <label htmlFor="staff-search" {...stylex.props(styles.srOnly)}>
                {t('filters.searchLabel')}
              </label>
              <span {...stylex.props(styles.searchIcon)}>
                <Icon name="search" {...stylex.props(styles.searchIconSvg)} />
              </span>
              <input
                id="staff-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('filters.searchPlaceholder')}
                {...stylex.props(styles.searchInput)}
              />
            </div>
            <div {...stylex.props(styles.roleSelect)}>
              {/* The kit's field owns its own label, so the hand-rolled
                  `srOnly` `<label htmlFor>` pair above it is gone. */}
              <SelectField
                label={t('filters.roleAria')}
                labelHidden
                size="chrome"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as StaffRole | '')}
                options={[
                  { value: '', label: t('filters.allRoles') },
                  ...STAFF_ROLES.map((role) => ({ value: role, label: t(`roles.${role}`) })),
                ]}
              />
            </div>
            {showBranchFilter ? (
              <div {...stylex.props(styles.roleSelect)}>
                <SelectField
                  label={tCommon('locationLabel')}
                  labelHidden
                  size="chrome"
                  // Always `''` while it renders: a chosen branch lands in the URL,
                  // the switcher adopts it, and this control unmounts. See
                  // `showBranchFilter`.
                  value=""
                  onChange={(event) => commitBranch(event.target.value)}
                  options={[
                    { value: '', label: tCommon('allLocations') },
                    ...branchOptions.map((location) => ({
                      value: location.id,
                      label: location.name,
                    })),
                  ]}
                />
              </div>
            ) : null}
            <span aria-hidden {...stylex.props(styles.spacer)} />
            {canManage ? (
              <>
                <Button
                  variant="secondary"
                  size="card"
                  onClick={() => setInviteOpen(true)}
                  icon={<Icon name="mail" {...stylex.props(styles.kitGlyph)} />}
                  label={t('invite')}
                />
                <Button
                  variant="primary"
                  size="card"
                  onClick={() => setAddOpen(true)}
                  icon={<Icon name="plus" {...stylex.props(styles.kitGlyph)} />}
                  label={t('addStaff')}
                />
              </>
            ) : null}
          </div>

          <StaffTable
            staff={visibleStaff}
            currentUserId={currentUserId}
            canManage={canManage}
            noMatch={staff.length > 0 && visibleStaff.length === 0}
            onSelectMember={setProfileMember}
            display={display}
          />
        </>
      ) : null}

      {activeTab === 'roles' ? <RolesCards roles={roles} staffCountByRole={roleCounts} /> : null}

      {canManage ? (
        <>
          <AddStaffDrawer open={addOpen} onClose={() => setAddOpen(false)} locations={locations} />

          <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />

          <Drawer
            open={manageRolesOpen}
            onClose={() => setManageRolesOpen(false)}
            label={t('manageRolesDrawer.title')}
          >
            <RolesPanel roles={roles} />
          </Drawer>
        </>
      ) : null}

      <StaffProfileDrawer
        key={profileMember?.id ?? 'none'}
        member={profileMember}
        onClose={() => setProfileMember(null)}
        locations={locations}
      />
    </div>
  );
}
