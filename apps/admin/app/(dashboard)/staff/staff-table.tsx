'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { ROLE_PERMISSIONS, type Permission, type StaffMember, type StaffRole } from '@fit/types';
import { ROLE_RANK } from '@/lib/auth-session';
import {
  Badge,
  Btn,
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

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  memberCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  avatar: {
    display: 'grid',
    height: '2.25rem',
    width: '2.25rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    fontSize: '0.75rem',
    fontWeight: 700,
    color: 'var(--color-text-accent)',
  },
  memberCol: {
    minWidth: 0,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  email: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  roleCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  roleSelect: {
    height: '2.25rem',
    paddingInline: '0.625rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    outline: 'none',
    opacity: {
      default: 1,
      ':disabled': 0.5,
    },
  },
  badgeGap: {
    gap: '0.375rem',
  },
  joined: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
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
  dangerBtn: {
    color: 'var(--color-error)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-error-muted)',
    },
  },
  confirmIntro: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  lostList: {
    marginTop: '0.5rem',
    listStyleType: 'disc',
    paddingInlineStart: '1.25rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  lostItem: {
    marginTop: '0.25rem',
  },
  noChange: {
    margin: 0,
    marginTop: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

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
    <div {...stylex.props(styles.memberCell)}>
      <span {...stylex.props(styles.avatar)}>{initialsOf(member.name)}</span>
      <div {...stylex.props(styles.memberCol)}>
        <div {...stylex.props(styles.nameRow)}>
          <span {...stylex.props(styles.name)}>{member.name}</span>
          {isSelf ? <Badge tone="brand">{t('you')}</Badge> : null}
        </div>
        <div {...stylex.props(styles.email)}>{member.email}</div>
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
          <div {...stylex.props(styles.roleCell)}>
            <Dot c={ROLE_DOT[member.role]} />
            <select
              aria-label={t('rowMenu.changeRole')}
              value={member.role}
              disabled={rowBusy}
              onChange={(event) => onRoleSelect(member, event.target.value as StaffRole)}
              {...stylex.props(styles.roleSelect)}
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
        <Badge
          tone={STATUS_TONES[member.status]}
          className={stylex.props(styles.badgeGap).className}
        >
          <Dot c={STATUS_DOT[member.status]} />
          {t(`status.${member.status}`)}
        </Badge>
      ),
    },
    {
      key: 'joined',
      header: t('columns.joined'),
      cell: (member) => (
        <span {...stylex.props(styles.joined)}>{formatDate(member.joinedAt, locale)}</span>
      ),
    },
    {
      key: 'actions',
      header: <span {...stylex.props(styles.srOnly)}>{t('columns.actions')}</span>,
      align: 'right',
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
            className={stylex.props(styles.dangerBtn).className}
          >
            {t('rowMenu.remove')}
          </Btn>
        );
      },
    },
  ];

  return (
    <div {...stylex.props(styles.stack)}>
      {error ? (
        <Card variant="default" padding={0} xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
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
            <p {...stylex.props(styles.confirmIntro)}>
              {t('confirm.downgradeIntro', { role: roleLabel(confirmChange.nextRole) })}
            </p>
            {confirmChange.lost.length > 0 ? (
              <ul {...stylex.props(styles.lostList)}>
                {confirmChange.lost.map((perm) => (
                  <li key={perm} {...stylex.props(styles.lostItem)}>
                    {t(`permissions.${PERMISSION_KEYS[perm]}`)}
                  </li>
                ))}
              </ul>
            ) : (
              <p {...stylex.props(styles.noChange)}>{t('confirm.downgradeNoChange')}</p>
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
