'use client';

import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { createDateTimeFormat } from '@fit/i18n';
import {
  ROLE_PERMISSIONS,
  STAFF_COLUMN_FIELDS,
  type GymStaffDirectorySettings,
  type Permission,
  type StaffMember,
  type StaffRole,
} from '@fit/types';
import { ROLE_RANK } from '@/lib/auth-session';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Dialog,
  Dot,
  EmptyState,
  type Column,
} from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import {
  PERMISSION_KEYS,
  ROLE_TONES,
  STAFF_ROLES,
  STATUS_DOT,
  STATUS_TONES,
  initialsOf,
} from './role-meta';
import { removeStaffAction, updateStaffRoleAction } from './actions';

/** An ISO instant as a short local date, or the raw value if it won't parse. */
function formatJoined(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : createDateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(
        date,
      );
}

/** The row menu's width, in px — mirrors `styles.menu`'s `12rem`, for right-aligning. */
const MENU_WIDTH = 192;
/**
 * Roughly how tall the menu gets (label + four roles + divider + remove). Only
 * used to decide whether it opens downward or flips above the trigger, so an
 * approximation is enough — the flipped branch anchors by `bottom` and never
 * needs the real height.
 */
const MENU_ESTIMATED_HEIGHT = 260;
/** Gap between the ⋯ trigger and the menu. */
const MENU_OFFSET = 4;

/** Viewport coordinates for the portalled row menu, as a `position: fixed` box. */
interface MenuPosition {
  left: number;
  /** Set when the menu opens downward; mutually exclusive with `bottom`. */
  top?: number;
  /** Set when the menu flips above its trigger, anchoring without knowing its height. */
  bottom?: number;
}

/**
 * Place the menu against its ⋯ trigger, right-aligned and clamped to the viewport.
 *
 * Flips above the trigger when there isn't room below — a row near the bottom of
 * a long roster would otherwise open a menu running off-screen. The flipped
 * branch anchors by `bottom`, so it lands correctly without measuring the menu.
 */
function menuPositionFrom(trigger: DOMRect): MenuPosition {
  const left = Math.max(MENU_OFFSET, trigger.right - MENU_WIDTH);
  const opensUpward =
    trigger.bottom + MENU_OFFSET + MENU_ESTIMATED_HEIGHT > window.innerHeight &&
    trigger.top > MENU_ESTIMATED_HEIGHT;

  return opensUpward
    ? { left, bottom: window.innerHeight - trigger.top + MENU_OFFSET }
    : { left, top: trigger.bottom + MENU_OFFSET };
}

/**
 * Portal the menu to `<body>`, escaping the clipping ancestors between it and the
 * cell it logically belongs to. Returns `null` before hydration, when there is no
 * `document` to portal into — the menu only exists in response to a click, so it
 * can never be needed during the server render.
 */
function renderMenu(children: ReactNode): ReactNode {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

/**
 * Merge computed viewport coordinates into StyleX's props. StyleX owns `style` for
 * its own dynamic values, so the position is spread on top rather than replacing it.
 */
function withPosition(
  props: ReturnType<typeof stylex.props>,
  position: MenuPosition,
): ReturnType<typeof stylex.props> {
  return { ...props, style: { ...props.style, ...position } };
}

/** Em dash for a cell with nothing to show (a staff member with no surname). */
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
    // Fixed + portalled to <body>: the menu lives inside a <td>, and both the
    // cell (astryx sets `overflow: hidden` on every cell) and the DataTable's
    // card/scroll wrapper clip their contents — an absolutely-positioned menu
    // was sliced down to the few pixels that fit inside the row.
    position: 'fixed',
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
  display,
}: {
  staff: StaffMember[];
  currentUserId: string | null;
  canManage: boolean;
  /** True when the roster is non-empty but the active search/filter hides every row. */
  noMatch: boolean;
  /** Open a member's profile drawer — a row click anywhere outside the ⋯ menu. */
  onSelectMember: (member: StaffMember) => void;
  /** Which columns this gym shows — Settings → Staff page. */
  display: GymStaffDirectorySettings;
}) {
  const t = useTranslations('admin.staff');
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  /** Where the open menu sits, measured from its trigger — see {@link menuPositionFrom}. */
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);

  // A fixed-position menu can't follow its trigger, so scrolling or resizing the
  // page would leave it stranded mid-screen. Closing is both simpler and the
  // behaviour people expect from a row menu.
  useEffect(() => {
    if (menuFor === null) return;
    const close = (): void => {
      setMenuFor(null);
      setMenuPos(null);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuFor]);
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

  /** A value the gym has never filled in, shown the way the surname cell shows one. */
  const blank = <span {...stylex.props(styles.muted)}>{DASH}</span>;

  /**
   * Every column a gym can switch on, keyed by its toggle. Typed as a total record
   * over {@link STAFF_COLUMN_FIELDS}, so adding a toggle to the contract without
   * giving it a cell here is a compile error rather than a setting that silently
   * does nothing.
   */
  const optionalColumns: Record<(typeof STAFF_COLUMN_FIELDS)[number], Column<StaffMember>> = {
    lastName: {
      key: 'lastName',
      header: t('columns.lastName'),
      cell: (member) => {
        const last = splitName(member.name).last;
        return last ? <span {...stylex.props(styles.lastName)}>{last}</span> : blank;
      },
    },
    role: {
      key: 'role',
      header: t('columns.role'),
      cell: (member) => <Badge tone={ROLE_TONES[member.role]} label={roleLabel(member.role)} />,
    },
    location: {
      key: 'location',
      header: t('columns.location'),
      cell: (member) =>
        member.locations.length > 0 ? (
          <span {...stylex.props(styles.muted)}>{member.locations.join(', ')}</span>
        ) : (
          blank
        ),
    },
    email: {
      key: 'email',
      header: t('columns.email'),
      cell: (member) =>
        member.email ? <span {...stylex.props(styles.muted)}>{member.email}</span> : blank,
    },
    phone: {
      key: 'phone',
      header: t('columns.phone'),
      cell: (member) =>
        member.phone ? <span {...stylex.props(styles.muted)}>{member.phone}</span> : blank,
    },
    status: {
      key: 'status',
      header: t('columns.status'),
      cell: (member) => (
        <Badge
          tone={STATUS_TONES[member.status]}
          label={
            <>
              <Dot tone={STATUS_DOT[member.status]} /> {t(`status.${member.status}`)}
            </>
          }
        />
      ),
    },
    joined: {
      key: 'joined',
      header: t('columns.joined'),
      cell: (member) => (
        <span {...stylex.props(styles.muted)}>{formatJoined(member.joinedAt, locale)}</span>
      ),
    },
  };

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
              {isSelf ? <Badge tone="accent" label={t('you')} /> : null}
            </div>
          </div>
        );
      },
    },
    // The gym's chosen columns, in the order Settings lists them.
    ...STAFF_COLUMN_FIELDS.filter((field) => display[field]).map((field) => optionalColumns[field]),
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
              onClick={(event) => {
                if (open) {
                  setMenuFor(null);
                  setMenuPos(null);
                  return;
                }
                setMenuPos(menuPositionFrom(event.currentTarget.getBoundingClientRect()));
                setMenuFor(member.id);
              }}
              {...stylex.props(styles.menuTrigger)}
            >
              <Icon name="more" {...stylex.props(styles.menuTriggerIcon)} />
            </button>
            {open && menuPos
              ? renderMenu(
                  <>
                    <div
                      {...stylex.props(styles.menuBackdrop)}
                      aria-hidden
                      onClick={() => {
                        setMenuFor(null);
                        setMenuPos(null);
                      }}
                    />
                    <div role="menu" {...withPosition(stylex.props(styles.menu), menuPos)}>
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
                      {/* The coach profile this person teaches under (staff ⇄
                          trainer link). Present for every TRAINER — the API
                          creates it with the staff record — and for anyone who
                          held the role before, whose profile is kept (deactivated)
                          so their class history survives. */}
                      {member.trainerId ? (
                        <>
                          <div {...stylex.props(styles.menuDivider)} aria-hidden />
                          <Link
                            href={`/trainers/${member.trainerId}`}
                            role="menuitem"
                            onClick={() => {
                              setMenuFor(null);
                              setMenuPos(null);
                            }}
                            {...stylex.props(styles.menuItem)}
                          >
                            <Icon name="dumbbell" {...stylex.props(styles.menuItemIcon)} />
                            {t('rowMenu.coachProfile')}
                          </Link>
                        </>
                      ) : null}
                      <div {...stylex.props(styles.menuDivider)} aria-hidden />
                      <button
                        type="button"
                        role="menuitem"
                        disabled={isSelf}
                        title={isSelf ? t('rowMenu.cannotRemoveSelf') : undefined}
                        onClick={() => {
                          setMenuFor(null);
                          setMenuPos(null);
                          setConfirmRemove(member);
                        }}
                        {...stylex.props(styles.menuItem, styles.menuDanger)}
                      >
                        <Icon name="trash" {...stylex.props(styles.menuItemIcon)} />
                        {t('rowMenu.remove')}
                      </button>
                    </div>
                  </>,
                )
              : null}
          </div>
        );
      },
    },
  ];

  return (
    <div {...stylex.props(styles.stack)}>
      {error ? (
        <Card padding="none" xstyle={styles.errorCard}>
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
              icon={<Icon name="search" />}
              title={t('table.noMatchTitle')}
              body={t('table.noMatchHint')}
            />
          ) : (
            <EmptyState
              icon={<Icon name="users" />}
              title={t('table.emptyTitle')}
              body={t('table.emptyHint')}
            />
          )
        }
      />

      {/* Role-downgrade confirmation, explaining the capabilities being given up.
          Uses the shared Modal (not ConfirmDialog) so the lost-capability list can
          render as a real <ul> rather than being wrapped in a paragraph. */}
      <Dialog
        open={confirmChange !== null}
        onClose={() => setConfirmChange(null)}
        dismissible={!pending}
        title={
          confirmChange
            ? t('confirm.downgradeTitle', {
                name: confirmChange.member.name,
                role: roleLabel(confirmChange.nextRole),
              })
            : ''
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="card"
              onClick={() => setConfirmChange(null)}
              disabled={pending}
              label={t('confirm.cancel')}
            />
            <Button
              variant="primary"
              size="card"
              onClick={() =>
                confirmChange && applyRole(confirmChange.member, confirmChange.nextRole)
              }
              disabled={pending}
              label={pending ? t('confirm.working') : t('confirm.downgradeConfirm')}
            />
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
      </Dialog>

      {/* Remove confirmation — removal revokes their sessions immediately. */}
      <ConfirmDialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => confirmRemove && applyRemove(confirmRemove)}
        loading={pending}
        confirmVariant="destructive"
        confirmLabel={t('confirm.removeConfirm')}
        cancelLabel={t('confirm.cancel')}
        title={confirmRemove ? t('confirm.removeTitle', { name: confirmRemove.name }) : ''}
        description={t('confirm.removeBody')}
      />
    </div>
  );
}
