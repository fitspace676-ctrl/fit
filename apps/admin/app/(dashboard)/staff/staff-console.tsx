'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { PendingInvite, StaffMember, StaffRole } from '@fit/types';
import {
  Btn,
  Card,
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
    <Card className="flex h-full flex-col p-5">
      <span className="grid h-10 w-10 place-items-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="mt-4 font-display text-3xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        <CountUp to={value} />
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
        {label}
      </p>
      <p className="mt-2 text-xs tabular-nums text-ink-500 dark:text-ink-400">{context}</p>
    </Card>
  );
}

/** A tab label with a trailing count chip. */
function TabLabel({ label, count }: { label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <span className="font-mono text-xs tabular-nums text-ink-400">{count}</span>
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
}: {
  staff: StaffMember[];
  invites: PendingInvite[];
  currentUserId: string | null;
  canManage: boolean;
}) {
  const t = useTranslations('admin.staff');
  const [tab, setTab] = useState<'people' | 'invitations'>('people');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<StaffRole | ''>('');
  const [inviteOpen, setInviteOpen] = useState(false);

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
    <div className="flex flex-col gap-6">
      <nav
        aria-label={t('breadcrumb.label')}
        className="flex items-center gap-1.5 text-xs font-medium text-ink-400 dark:text-ink-500"
      >
        <span>Iron Gym</span>
        <Icon name="chevronRight" className="h-3.5 w-3.5" />
        <span className="text-ink-600 dark:text-ink-300">{t('breadcrumb.staff')}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            {t('title')}
          </h1>
          <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">{t('subtitle')}</p>
        </div>
        {canManage ? (
          <Btn v="primary" icon="plus" onClick={() => setInviteOpen(true)}>
            {t('invite')}
          </Btn>
        ) : null}
      </header>

      {/* Gym-wide KPI cards — live aggregates over the whole roster. */}
      <section aria-label={t('title')} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
        onValueChange={(next) => setTab(next as 'people' | 'invitations')}
        items={[
          {
            value: 'people',
            label: <TabLabel label={t('tabs.people')} count={staff.length} />,
          },
          {
            value: 'invitations',
            label: <TabLabel label={t('tabs.invitations')} count={invites.length} />,
          },
        ]}
      />

      {tab === 'people' ? (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <FilterChips
              chips={roleChips}
              active={roleFilter}
              onSelect={(value) => setRoleFilter(value as StaffRole | '')}
              ariaLabel={t('filters.roleAria')}
            />
            <div className="relative lg:w-72">
              <label htmlFor="staff-search" className="sr-only">
                {t('filters.searchLabel')}
              </label>
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-400">
                <Icon name="search" className="h-4 w-4" />
              </span>
              <input
                id="staff-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('filters.searchPlaceholder')}
                className="h-11 w-full rounded-field border border-ink-200 bg-white pl-9 pr-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
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
      ) : (
        <InvitesTable invites={invites} canManage={canManage} />
      )}

      {canManage ? <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} /> : null}
    </div>
  );
}
