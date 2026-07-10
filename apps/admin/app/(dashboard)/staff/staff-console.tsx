'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type {
  ListStaffRolesResponse,
  PendingInvite,
  StaffMember,
  StaffRole,
  TimeOffRequestRow,
} from '@fit/types';
import {
  Btn,
  CountUp,
  FilterChips,
  Icon,
  Tabs,
  type FilterChip,
  type IconName,
} from '@/components/ui';
import { STAFF_ROLES } from './role-meta';
import { StaffTable } from './staff-table';
import { InvitesTable } from './invites-table';
import { InviteModal } from './invite-modal';
import { RolesPanel } from './roles-panel';
import { NotesPanel } from './notes-panel';
import { TasksPanel } from './tasks-panel';
import { SchedulePanel } from './schedule-panel';
import { SpecialtiesPanel } from './specialties-panel';
import { TimeOffPanel } from './timeoff-panel';

/** The staff-console top-level tabs. */
type ConsoleTab =
  | 'people'
  | 'invitations'
  | 'roles'
  | 'notes'
  | 'tasks'
  | 'schedule'
  | 'timeoff'
  | 'specialties';

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
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: {
      default: '1fr 1fr',
      '@media (min-width: 1024px)': 'repeat(4, 1fr)',
    },
    gap: '1rem',
  },
  kpiCard: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    padding: '1.25rem',
  },
  kpiIcon: {
    display: 'grid',
    height: '2.5rem',
    width: '2.5rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  kpiIconSvg: {
    height: '1.25rem',
    width: '1.25rem',
  },
  kpiValue: {
    margin: 0,
    marginTop: '1rem',
    fontSize: '1.875rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.025em',
    color: 'var(--color-text-primary)',
  },
  kpiLabel: {
    margin: 0,
    marginTop: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  kpiContext: {
    margin: 0,
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  tabLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
  },
  tabCount: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  filterRow: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 1024px)': 'row',
    },
    alignItems: {
      default: 'stretch',
      '@media (min-width: 1024px)': 'center',
    },
    justifyContent: {
      default: 'flex-start',
      '@media (min-width: 1024px)': 'space-between',
    },
    gap: '0.75rem',
  },
  searchWrap: {
    position: 'relative',
    width: {
      default: '100%',
      '@media (min-width: 1024px)': '18rem',
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
});

/** One roster KPI card — icon tile, animated headline value, label, and context. */
function KpiCard({
  label,
  value,
  context,
  icon,
}: {
  label: string;
  value: number;
  context: string;
  icon: IconName;
}) {
  return (
    <Card variant="default" padding={0} xstyle={styles.kpiCard}>
      <span {...stylex.props(styles.kpiIcon)}>
        <Icon name={icon} {...stylex.props(styles.kpiIconSvg)} />
      </span>
      <p {...stylex.props(styles.kpiValue)}>
        <CountUp to={value} />
      </p>
      <p {...stylex.props(styles.kpiLabel)}>{label}</p>
      <p {...stylex.props(styles.kpiContext)}>{context}</p>
    </Card>
  );
}

/** A tab label with a trailing count chip. */
function TabLabel({ label, count }: { label: string; count: number }) {
  return (
    <span {...stylex.props(styles.tabLabel)}>
      {label}
      <span {...stylex.props(styles.tabCount)}>{count}</span>
    </span>
  );
}

/**
 * The staff console shell (T2.10) — the client half of the staff screen, rebuilt
 * to the formacore staff artboard. Renders the header (with the "Invite staff"
 * button that opens the shared modal), the four gym-wide KPI cards, the
 * People / Invitations tabs, and — on the People tab — a role filter + search
 * over the (small, un-paginated) roster, filtered client-side. The staff list and
 * pending invites are server-rendered and passed in; this component owns only the
 * view state (active tab, search, role filter, invite-modal open).
 */
export function StaffConsole({
  staff,
  invites,
  currentUserId,
  canManage,
  roles,
  timeOff,
}: {
  staff: StaffMember[];
  invites: PendingInvite[];
  currentUserId: string | null;
  canManage: boolean;
  roles: ListStaffRolesResponse;
  timeOff: TimeOffRequestRow[];
}) {
  const t = useTranslations('admin.staff');
  const [tab, setTab] = useState<ConsoleTab>('people');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<StaffRole | ''>('');
  const [inviteOpen, setInviteOpen] = useState(false);
  // Shared across the per-staff depth tabs (Notes / Tasks / Calendar / Specialties)
  // so switching tabs keeps the chosen member. Defaults to the first staff row.
  const [selectedStaffId, setSelectedStaffId] = useState(staff[0]?.id ?? '');

  const activeCount = useMemo(
    () => staff.filter((member) => member.status === 'ACTIVE').length,
    [staff],
  );
  const distinctRoles = useMemo(() => new Set(staff.map((member) => member.role)).size, [staff]);

  const roleCounts = useMemo(() => {
    const counts = new Map<StaffRole, number>();
    for (const member of staff) {
      counts.set(member.role, (counts.get(member.role) ?? 0) + 1);
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

  const roleChips: FilterChip[] = [
    { label: t('filters.all'), value: '', count: staff.length },
    ...STAFF_ROLES.map((role) => ({
      label: t(`roles.${role}`),
      value: role,
      count: roleCounts.get(role) ?? 0,
    })),
  ];

  return (
    <div {...stylex.props(styles.stack)}>
      <nav aria-label={t('breadcrumb.label')} {...stylex.props(styles.breadcrumb)}>
        <span>Iron Gym</span>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <span {...stylex.props(styles.crumbCurrent)}>{t('breadcrumb.staff')}</span>
      </nav>

      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headline)}>
          <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
          <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
        </div>
        {canManage ? (
          <Btn v="primary" icon="plus" onClick={() => setInviteOpen(true)}>
            {t('invite')}
          </Btn>
        ) : null}
      </header>

      {/* Gym-wide KPI cards — live aggregates over the whole roster. */}
      <section aria-label={t('title')} {...stylex.props(styles.kpiGrid)}>
        <KpiCard
          label={t('kpi.total')}
          value={staff.length}
          context={t('kpi.totalContext', { count: activeCount })}
          icon="users"
        />
        <KpiCard
          label={t('kpi.active')}
          value={activeCount}
          context={t('kpi.activeContext')}
          icon="bolt"
        />
        <KpiCard
          label={t('kpi.pending')}
          value={invites.length}
          context={t('kpi.pendingContext')}
          icon="message"
        />
        <KpiCard
          label={t('kpi.roles')}
          value={distinctRoles}
          context={t('kpi.rolesContext')}
          icon="shield"
        />
      </section>

      <Tabs
        aria-label={t('title')}
        value={tab}
        onValueChange={(next) => setTab(next as ConsoleTab)}
        items={[
          {
            value: 'people',
            label: <TabLabel label={t('tabs.people')} count={staff.length} />,
          },
          {
            value: 'invitations',
            label: <TabLabel label={t('tabs.invitations')} count={invites.length} />,
          },
          { value: 'roles', label: t('tabs.roles') },
          { value: 'notes', label: t('tabs.notes') },
          { value: 'tasks', label: t('tabs.tasks') },
          { value: 'schedule', label: t('tabs.schedule') },
          {
            value: 'timeoff',
            label: <TabLabel label={t('tabs.timeoff')} count={timeOff.length} />,
          },
          { value: 'specialties', label: t('tabs.specialties') },
        ]}
      />

      {tab === 'people' ? (
        <>
          <div {...stylex.props(styles.filterRow)}>
            <FilterChips
              chips={roleChips}
              active={roleFilter}
              onSelect={(value) => setRoleFilter(value as StaffRole | '')}
              ariaLabel={t('filters.roleAria')}
            />
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
          </div>

          <StaffTable
            staff={visibleStaff}
            currentUserId={currentUserId}
            canManage={canManage}
            noMatch={staff.length > 0 && visibleStaff.length === 0}
          />
        </>
      ) : null}

      {tab === 'invitations' ? <InvitesTable invites={invites} canManage={canManage} /> : null}
      {tab === 'roles' ? <RolesPanel roles={roles} /> : null}
      {tab === 'notes' ? (
        <NotesPanel
          staff={staff}
          selectedStaffId={selectedStaffId}
          onSelectStaff={setSelectedStaffId}
        />
      ) : null}
      {tab === 'tasks' ? (
        <TasksPanel
          staff={staff}
          selectedStaffId={selectedStaffId}
          onSelectStaff={setSelectedStaffId}
        />
      ) : null}
      {tab === 'schedule' ? (
        <SchedulePanel
          staff={staff}
          selectedStaffId={selectedStaffId}
          onSelectStaff={setSelectedStaffId}
        />
      ) : null}
      {tab === 'timeoff' ? <TimeOffPanel staff={staff} initialRequests={timeOff} /> : null}
      {tab === 'specialties' ? (
        <SpecialtiesPanel
          staff={staff}
          selectedStaffId={selectedStaffId}
          onSelectStaff={setSelectedStaffId}
        />
      ) : null}

      {canManage ? <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} /> : null}
    </div>
  );
}
