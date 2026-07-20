'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { ListStaffRolesResponse, StaffMember, StaffRole, WorkingTodayRow } from '@fit/types';
import { Btn, Drawer, Icon, Select, Tabs } from '@/components/ui';
import { STAFF_ROLES } from './role-meta';
import { StaffTable } from './staff-table';
import { AddStaffDrawer } from './add-staff-drawer';
import { StaffProfileDrawer } from './staff-profile-drawer';
import { InviteModal } from './invite-modal';
import { RolesPanel } from './roles-panel';
import { RolesCards } from './roles-cards';
import { WhosWorkingCard } from './whos-working-card';

/** The staff-console top-level tabs — Stage 1 keeps just these two. */
type ConsoleTab = 'staff' | 'roles';

const styles = stylex.create({
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
 * "Who's Working Today" card, and two tabs: the roster
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
  workingToday,
  locations,
}: {
  staff: StaffMember[];
  currentUserId: string | null;
  canManage: boolean;
  roles: ListStaffRolesResponse;
  workingToday: WorkingTodayRow[];
  /** The gym's live locations, offered as assignable-location chips in the Add drawer. */
  locations: { id: string; name: string }[];
}) {
  const t = useTranslations('admin.staff');
  const [tab, setTab] = useState<ConsoleTab>('staff');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<StaffRole | ''>('');
  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [manageRolesOpen, setManageRolesOpen] = useState(false);
  const [profileMember, setProfileMember] = useState<StaffMember | null>(null);

  const roleCounts = useMemo(() => {
    const counts: Partial<Record<StaffRole, number>> = {};
    for (const member of staff) {
      counts[member.role] = (counts[member.role] ?? 0) + 1;
    }
    return counts;
  }, [staff]);

  const visibleStaff = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return staff.filter((member) => {
      const matchesRole = roleFilter === '' || member.role === roleFilter;
      const matchesSearch =
        needle === '' ||
        member.name.toLowerCase().includes(needle) ||
        member.email.toLowerCase().includes(needle);
      return matchesRole && matchesSearch;
    });
  }, [staff, query, roleFilter]);

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
            <Btn v="outline" icon="shield" onClick={() => setManageRolesOpen(true)}>
              {t('manageRoles')}
            </Btn>
          </div>
        ) : null}
      </header>

      <WhosWorkingCard shifts={workingToday} />

      <Tabs
        aria-label={t('title')}
        value={tab}
        onValueChange={(next) => setTab(next as ConsoleTab)}
        items={[
          { value: 'staff', label: t('tabs.staffList') },
          { value: 'roles', label: t('tabs.rolesPermissions') },
        ]}
      />

      {tab === 'staff' ? (
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
              <label htmlFor="staff-role-filter" {...stylex.props(styles.srOnly)}>
                {t('filters.roleAria')}
              </label>
              <Select
                id="staff-role-filter"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as StaffRole | '')}
              >
                <option value="">{t('filters.allRoles')}</option>
                {STAFF_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {t(`roles.${role}`)}
                  </option>
                ))}
              </Select>
            </div>
            <span aria-hidden {...stylex.props(styles.spacer)} />
            {canManage ? (
              <>
                <Btn v="outline" icon="mail" onClick={() => setInviteOpen(true)}>
                  {t('invite')}
                </Btn>
                <Btn v="primary" icon="plus" onClick={() => setAddOpen(true)}>
                  {t('addStaff')}
                </Btn>
              </>
            ) : null}
          </div>

          <StaffTable
            staff={visibleStaff}
            currentUserId={currentUserId}
            canManage={canManage}
            noMatch={staff.length > 0 && visibleStaff.length === 0}
            onSelectMember={setProfileMember}
          />
        </>
      ) : (
        <RolesCards roles={roles} staffCountByRole={roleCounts} />
      )}

      {canManage ? (
        <>
          <AddStaffDrawer open={addOpen} onClose={() => setAddOpen(false)} locations={locations} />

          <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />

          <Drawer
            open={manageRolesOpen}
            onClose={() => setManageRolesOpen(false)}
            title={t('manageRolesDrawer.title')}
            size="lg"
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
