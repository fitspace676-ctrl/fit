'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
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
  ROLE_TONES,
  STAFF_ROLES,
  STATUS_DOT,
  STATUS_TONES,
  initialsOf,
} from './role-meta';
import { removeStaffAction, updateStaffRoleAction } from './actions';

/** Em dash for a column we don't yet carry data for (location…). */
const DASH = '—';

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
  nameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    minWidth: 0,
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
  nameCol: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    minWidth: 0,
  },
  firstName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  lastName: {
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  muted: {
    color: 'var(--color-text-secondary)',
  },
  badgeGap: {
    gap: '0.375rem',
  },
  lastLogin: {
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
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
  // -- Row action menu (⋯) ---------------------------------------------------
  menuAnchor: {
    position: 'relative',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  menuTrigger: {
    display: 'grid',
    height: '2rem',
    width: '2rem',
    placeItems: 'center',
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
    color: 'var(--color-icon-secondary)',
    cursor: 'pointer',
    opacity: {
      default: 1,
      ':disabled': 0.4,
    },
  },
  menuTriggerIcon: {
    width: '1.125rem',
    height: '1.125rem',
  },
  menuBackdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 30,
  },
  menu: {
    position: 'absolute',
    right: 0,
    top: '2.25rem',
    zIndex: 40,
    width: '12rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-popover)',
    padding: '0.375rem',
    boxShadow: 'var(--shadow-popover, 0 10px 30px rgba(9, 9, 11, 0.18))',
  },
  menuLabel: {
    margin: 0,
    paddingInline: '0.625rem',
    paddingBlock: '0.375rem',
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
  },
  menuItem: {
    display: 'flex',
    height: '2.25rem',
    width: '100%',
    alignItems: 'center',
    gap: '0.625rem',
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.625rem',
    textAlign: 'left',
    fontSize: '0.875rem',
    fontWeight: 500,
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    opacity: {
      default: 1,
      ':disabled': 0.45,
    },
  },
  menuItemActive: {
    color: 'var(--color-text-primary)',
    fontWeight: 600,
  },
  menuItemIcon: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
  },
  menuItemCheck: {
    marginLeft: 'auto',
    width: '1rem',
    height: '1rem',
    color: 'var(--color-text-accent)',
  },
  menuDivider: {
    height: '1px',
    marginBlock: '0.375rem',
    marginInline: '0.25rem',
    backgroundColor: 'var(--color-border)',
  },
  menuDanger: {
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

/**
 * Split a single display name into a first name and a last name for the roster's
 * two name columns. We only store one `name` field today, so this is a display
 * heuristic — the first whitespace-delimited token is the first name, the rest is
 * the last name (empty when the name is a single word). Real first/last fields
 * are a later stage.
 */
function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}

/** A pending role change awaiting confirmation in the downgrade modal. */
interface PendingChange {
  member: StaffMember;
  nextRole: StaffRole;
  lost: Permission[];
}

/**
 * The active-staff roster, rebuilt to the reference staff artboard: one row per
 * staff member across First Name · Last Name · Role · Location · Status ·
 * Last Login · Actions. Location and Last Login are shown as placeholders
 * (`—` / "Never") until their backing data lands in a later stage.
 *
 * Server-rendered data, client-side interaction: the trailing ⋯ menu changes a
 * member's role or removes them. Re-roling to a lower-privilege role opens the
 * shared confirm modal spelling out the capabilities that will be lost; an upgrade
 * or sideways move applies straight away. Removal always confirms first, since it
 * revokes access immediately. Every mutation runs through a Server Action and the
 * page revalidates. The signed-in owner's own row is flagged and can't self-remove.
 */
export function StaffTable({
  staff,
  currentUserId,
  canManage,
  noMatch,
  onSelectMember,
}: {
  staff: StaffMember[];
  currentUserId: string | null;
  canManage: boolean;
  /** True when the roster is non-empty but the active search/filter hides every row. */
  noMatch: boolean;
  /** Open a member's profile drawer — a row click anywhere outside the ⋯ menu. */
  onSelectMember: (member: StaffMember) => void;
}) {
  const t = useTranslations('admin.staff');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
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
    setMenuFor(null);
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
      key: 'firstName',
      header: t('columns.firstName'),
      cell: (member) => {
        const isSelf = currentUserId !== null && member.userId === currentUserId;
        return (
          <div {...stylex.props(styles.nameCell)}>
            <span {...stylex.props(styles.avatar)}>{initialsOf(member.name)}</span>
            <div {...stylex.props(styles.nameCol)}>
              <span {...stylex.props(styles.firstName)}>{splitName(member.name).first}</span>
              {isSelf ? <Badge tone="brand">{t('you')}</Badge> : null}
            </div>
          </div>
        );
      },
    },
    {
      key: 'lastName',
      header: t('columns.lastName'),
      cell: (member) => {
        const last = splitName(member.name).last;
        return last ? (
          <span {...stylex.props(styles.lastName)}>{last}</span>
        ) : (
          <span {...stylex.props(styles.muted)}>{DASH}</span>
        );
      },
    },
    {
      key: 'role',
      header: t('columns.role'),
      cell: (member) => <Badge tone={ROLE_TONES[member.role]}>{roleLabel(member.role)}</Badge>,
    },
    {
      key: 'location',
      header: t('columns.location'),
      // Placeholder — staff↔location assignment lands in a later stage.
      cell: () => <span {...stylex.props(styles.muted)}>{DASH}</span>,
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
      key: 'lastLogin',
      header: t('columns.lastLogin'),
      // Placeholder — last-login tracking isn't wired yet, so everyone reads "Never".
      cell: () => <span {...stylex.props(styles.lastLogin)}>{t('values.never')}</span>,
    },
    {
      key: 'actions',
      header: <span {...stylex.props(styles.srOnly)}>{t('columns.actions')}</span>,
      align: 'right',
      cell: (member) => {
        if (!canManage) return null;
        const isSelf = currentUserId !== null && member.userId === currentUserId;
        const rowBusy = busyId === member.id && pending;
        const open = menuFor === member.id;
        return (
          // Stop menu interactions from bubbling to the row's profile-open click.
          <div {...stylex.props(styles.menuAnchor)} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              aria-label={t('rowMenu.open', { name: member.name })}
              aria-haspopup="menu"
              aria-expanded={open}
              disabled={rowBusy}
              onClick={() => setMenuFor(open ? null : member.id)}
              {...stylex.props(styles.menuTrigger)}
            >
              <Icon name="more" {...stylex.props(styles.menuTriggerIcon)} />
            </button>
            {open ? (
              <>
                <div
                  {...stylex.props(styles.menuBackdrop)}
                  aria-hidden
                  onClick={() => setMenuFor(null)}
                />
                <div role="menu" {...stylex.props(styles.menu)}>
                  <p {...stylex.props(styles.menuLabel)}>{t('rowMenu.changeRole')}</p>
                  {STAFF_ROLES.map((role) => {
                    const active = role === member.role;
                    return (
                      <button
                        key={role}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        disabled={active}
                        onClick={() => onRoleSelect(member, role)}
                        {...stylex.props(styles.menuItem, active && styles.menuItemActive)}
                      >
                        <Icon name="shield" {...stylex.props(styles.menuItemIcon)} />
                        {t('rowMenu.setRole', { role: roleLabel(role) })}
                        {active ? (
                          <Icon name="check" {...stylex.props(styles.menuItemCheck)} />
                        ) : null}
                      </button>
                    );
                  })}
                  <div {...stylex.props(styles.menuDivider)} aria-hidden />
                  <button
                    type="button"
                    role="menuitem"
                    disabled={isSelf}
                    title={isSelf ? t('rowMenu.cannotRemoveSelf') : undefined}
                    onClick={() => {
                      setMenuFor(null);
                      setConfirmRemove(member);
                    }}
                    {...stylex.props(styles.menuItem, styles.menuDanger)}
                  >
                    <Icon name="trash" {...stylex.props(styles.menuItemIcon)} />
                    {t('rowMenu.remove')}
                  </button>
                </div>
              </>
            ) : null}
          </div>
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
        onRowClick={onSelectMember}
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
