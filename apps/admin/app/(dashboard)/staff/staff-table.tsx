'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ROLE_PERMISSIONS, type Permission, type StaffMember, type StaffRole } from '@fit/types';
import { ROLE_RANK } from '@/lib/auth-session';
import {
  Badge,
  Btn,
  Card,
  ConfirmDialog,
  DataTable,
  Dot,
  EmptyState,
  Icon,
  Modal,
  type Column,
} from '@/components/ui';
import {
  PERMISSION_KEYS,
  ROLE_DOT,
  ROLE_TONES,
  STAFF_ROLES,
  STATUS_DOT,
  STATUS_TONES,
  initialsOf,
} from './role-meta';
import { removeStaffAction, updateStaffRoleAction } from './actions';

/** Translator for the `admin.staff` namespace. */
type T = ReturnType<typeof useTranslations>;

/** The capabilities held by `from` but not by `to` — what a downgrade gives up. */
function lostPermissions(from: StaffRole, to: StaffRole): Permission[] {
  const after = new Set<Permission>(ROLE_PERMISSIONS[to]);
  return ROLE_PERMISSIONS[from].filter((perm) => !after.has(perm));
}

/** A pending role change awaiting confirmation in the downgrade modal. */
interface PendingChange {
  member: StaffMember;
  nextRole: StaffRole;
  lost: Permission[];
}

/** Format an ISO instant as a short local date, or an em dash when absent/invalid. */
function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** The member cell — avatar initials, name (+ "You" flag), and email. */
function MemberCell({ member, isSelf, t }: { member: StaffMember; isSelf: boolean; t: T }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-500/15 dark:text-brand-200">
        {initialsOf(member.name)}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-ink-900 dark:text-white">{member.name}</span>
          {isSelf ? <Badge tone="brand">{t('you')}</Badge> : null}
        </div>
        <div className="truncate text-xs text-ink-500 dark:text-ink-400">{member.email}</div>
      </div>
    </div>
  );
}

/**
 * The active-staff roster (T2.10), rebuilt on the shared formacore `DataTable`.
 * Server-rendered data, client-side interaction: each row shows the member,
 * an inline role <select>, a status badge, the join date, and a Remove action.
 * Re-roling to a lower-privilege role opens the shared `ConfirmDialog` spelling
 * out the capabilities that will be lost; an upgrade or sideways move applies
 * straight away. Removing a staff member always confirms first, since it revokes
 * their access immediately. Every mutation runs through a Server Action and the
 * page revalidates, so the table reflects the API's view rather than optimistic
 * local state. The signed-in owner's own row is flagged and can't be self-removed.
 */
export function StaffTable({
  staff,
  currentUserId,
  canManage,
  noMatch,
}: {
  staff: StaffMember[];
  currentUserId: string | null;
  canManage: boolean;
  /** True when the roster is non-empty but the active search/filter hides every row. */
  noMatch: boolean;
}) {
  const t = useTranslations('admin.staff');
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmChange, setConfirmChange] = useState<PendingChange | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<StaffMember | null>(null);

  function applyRole(member: StaffMember, nextRole: StaffRole): void {
    setError(null);
    setBusyId(member.id);
    startTransition(async () => {
      const result = await updateStaffRoleAction(member.id, nextRole);
      setBusyId(null);
      setConfirmChange(null);
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  function onRoleSelect(member: StaffMember, nextRole: StaffRole): void {
    if (nextRole === member.role) {
      return;
    }
    // A downgrade (lower privilege) must be confirmed with the lost-permission list.
    if (ROLE_RANK[nextRole] < ROLE_RANK[member.role]) {
      setConfirmChange({ member, nextRole, lost: lostPermissions(member.role, nextRole) });
      return;
    }
    applyRole(member, nextRole);
  }

  function applyRemove(member: StaffMember): void {
    setError(null);
    setBusyId(member.id);
    startTransition(async () => {
      const result = await removeStaffAction(member.id);
      setBusyId(null);
      setConfirmRemove(null);
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  const roleLabel = (role: StaffRole): string => t(`roles.${role}`);

  const columns: Column<StaffMember>[] = [
    {
      key: 'member',
      header: t('columns.member'),
      cell: (member) => (
        <MemberCell
          member={member}
          isSelf={currentUserId !== null && member.userId === currentUserId}
          t={t}
        />
      ),
    },
    {
      key: 'role',
      header: t('columns.role'),
      cell: (member) => {
        const rowBusy = busyId === member.id && pending;
        if (!canManage) {
          return <Badge tone={ROLE_TONES[member.role]}>{roleLabel(member.role)}</Badge>;
        }
        return (
          <div className="flex items-center gap-2">
            <Dot c={ROLE_DOT[member.role]} />
            <select
              aria-label={t('rowMenu.changeRole')}
              value={member.role}
              disabled={rowBusy}
              onChange={(event) => onRoleSelect(member, event.target.value as StaffRole)}
              className="h-9 rounded-field border border-ink-200 bg-white px-2.5 text-sm font-medium text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-200"
            >
              {STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (member) => (
        <Badge tone={STATUS_TONES[member.status]} className="gap-1.5">
          <Dot c={STATUS_DOT[member.status]} />
          {t(`status.${member.status}`)}
        </Badge>
      ),
    },
    {
      key: 'joined',
      header: t('columns.joined'),
      className: 'font-mono tabular-nums text-ink-700 dark:text-ink-200',
      cell: (member) => formatDate(member.joinedAt, locale),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('columns.actions')}</span>,
      align: 'right',
      headerClassName: 'w-24 pr-5',
      className: 'pr-5',
      cell: (member) => {
        if (!canManage) return null;
        const isSelf = currentUserId !== null && member.userId === currentUserId;
        const rowBusy = busyId === member.id && pending;
        return (
          <Btn
            v="ghost"
            size="sm"
            icon="trash"
            disabled={rowBusy || isSelf}
            title={isSelf ? t('rowMenu.cannotRemoveSelf') : undefined}
            onClick={() => setConfirmRemove(member)}
            className="text-danger-700 hover:bg-danger-50 dark:text-danger-300 dark:hover:bg-danger-500/10"
          >
            {t('rowMenu.remove')}
          </Btn>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Card className="flex items-start gap-2 border-danger-200 bg-danger-50 px-3 py-2 dark:border-danger-500/20 dark:bg-danger-500/10">
          <Icon
            name="info"
            className="mt-0.5 h-4 w-4 shrink-0 text-danger-600 dark:text-danger-300"
          />
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
            {error}
          </p>
        </Card>
      ) : null}

      <DataTable
        columns={columns}
        rows={staff}
        rowKey={(member) => member.id}
        caption={t('table.caption')}
        empty={
          noMatch ? (
            <EmptyState
              icon="search"
              title={t('table.noMatchTitle')}
              message={t('table.noMatchHint')}
            />
          ) : (
            <EmptyState icon="users" title={t('table.emptyTitle')} message={t('table.emptyHint')} />
          )
        }
      />

      {/* Role-downgrade confirmation, explaining the capabilities being given up.
          Uses the shared Modal (not ConfirmDialog) so the lost-capability list can
          render as a real <ul> rather than being wrapped in a paragraph. */}
      <Modal
        open={confirmChange !== null}
        onClose={() => setConfirmChange(null)}
        size="sm"
        disableBackdropClose={pending}
        hideClose={pending}
        title={
          confirmChange
            ? t('confirm.downgradeTitle', {
                name: confirmChange.member.name,
                role: roleLabel(confirmChange.nextRole),
              })
            : ''
        }
        footer={
          <>
            <Btn v="outline" onClick={() => setConfirmChange(null)} disabled={pending}>
              {t('confirm.cancel')}
            </Btn>
            <Btn
              v="primary"
              onClick={() =>
                confirmChange && applyRole(confirmChange.member, confirmChange.nextRole)
              }
              disabled={pending}
            >
              {pending ? t('confirm.working') : t('confirm.downgradeConfirm')}
            </Btn>
          </>
        }
      >
        {confirmChange ? (
          <>
            <p className="text-sm text-ink-600 dark:text-ink-300">
              {t('confirm.downgradeIntro', { role: roleLabel(confirmChange.nextRole) })}
            </p>
            {confirmChange.lost.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-600 dark:text-ink-300">
                {confirmChange.lost.map((perm) => (
                  <li key={perm}>{t(`permissions.${PERMISSION_KEYS[perm]}`)}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
                {t('confirm.downgradeNoChange')}
              </p>
            )}
          </>
        ) : null}
      </Modal>

      {/* Remove confirmation — removal revokes their sessions immediately. */}
      <ConfirmDialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => confirmRemove && applyRemove(confirmRemove)}
        busy={pending}
        danger
        confirmLabel={t('confirm.removeConfirm')}
        cancelLabel={t('confirm.cancel')}
        title={confirmRemove ? t('confirm.removeTitle', { name: confirmRemove.name }) : ''}
        message={t('confirm.removeBody')}
      />
    </div>
  );
}
