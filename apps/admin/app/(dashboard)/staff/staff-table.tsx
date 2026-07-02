'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import {
  ROLE_PERMISSIONS,
  type Permission,
  type StaffMember,
  type StaffRole,
  type StaffStatus,
} from '@fit/types';
import { ROLE_RANK } from '@/lib/auth-session';
import { Badge, Btn, Card, Dot, Icon, useToast, type Tone } from '@/components/ui';
import { Glyph } from './icons';
import { PERMISSION_LABELS, ROLE_DOT, ROLE_OPTIONS, ROLE_TONE, roleLabel } from './role-meta';
import { removeStaffAction, updateStaffRoleAction } from './actions';

/** The engine gradient shared by the primary controls (Planflow "formacore"). */
const ENGINE_GRADIENT = 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)]';

/** Visual treatment per staff status — green active, amber invited, red suspended. */
const STATUS_STYLES: Record<StaffStatus, { label: string; tone: Tone; dot: string }> = {
  ACTIVE: { label: 'Active', tone: 'success', dot: 'bg-success-400' },
  INVITED: { label: 'Invited', tone: 'warning', dot: 'bg-warning-400' },
  SUSPENDED: { label: 'Suspended', tone: 'danger', dot: 'bg-danger-400' },
};

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

/** Render a staff member's initials for the avatar placeholder. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Render an ISO instant as a short local date. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The active-staff table (T4.7), reskinned to the Planflow "formacore" reference.
 * Server-rendered data, client-side interaction: a search field + role-filter
 * pills over the rows, and a per-row ⋯ menu carrying the real actions — "Change
 * role" (a nested role picker) and "Remove". Re-roling to a lower-privilege role
 * opens a confirmation modal spelling out the capabilities that will be lost (per
 * the spec); an upgrade or sideways move applies straight away. Removing a staff
 * member always confirms first, since it revokes their access immediately. Every
 * mutation runs through a Server Action and the page revalidates, so the table
 * reflects the API's view rather than optimistic local state. The signed-in
 * owner's own row is flagged and can't be self-removed here.
 */
export function StaffTable({
  staff,
  currentUserId,
}: {
  staff: StaffMember[];
  currentUserId: string | null;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmChange, setConfirmChange] = useState<PendingChange | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<StaffMember | null>(null);

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<StaffRole | 'All'>('All');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [pickingRole, setPickingRole] = useState(false);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return staff.filter(
      (member) =>
        (roleFilter === 'All' || member.role === roleFilter) &&
        (needle === '' ||
          member.name.toLowerCase().includes(needle) ||
          member.email.toLowerCase().includes(needle)),
    );
  }, [staff, query, roleFilter]);

  function openMenu(memberId: string): void {
    setPickingRole(false);
    setMenuFor((current) => (current === memberId ? null : memberId));
  }

  function applyRole(member: StaffMember, nextRole: StaffRole): void {
    setError(null);
    setBusyId(member.id);
    startTransition(async () => {
      const result = await updateStaffRoleAction(member.id, nextRole);
      setBusyId(null);
      setConfirmChange(null);
      if (result.ok) {
        toast(`${member.name} is now a ${roleLabel(nextRole)}`);
      } else {
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
      if (result.ok) {
        toast(`${member.name} removed`);
      } else {
        setError(result.error);
      }
    });
  }

  if (staff.length === 0) {
    return (
      <Card className="py-16 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-card bg-ink-50 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.03] dark:ring-white/10">
          <Icon name="users" className="h-6 w-6 text-ink-400 dark:text-ink-500" />
        </div>
        <p className="mt-3 font-semibold text-ink-900 dark:text-white">No staff yet</p>
        <p className="text-sm text-ink-500 dark:text-ink-400">Invite someone to get started.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <Card className="flex items-start gap-2 bg-danger-50 px-3 py-2 dark:bg-danger-500/10">
          <Icon
            name="info"
            className="mt-0.5 h-4 w-4 shrink-0 text-danger-600 dark:text-danger-300"
          />
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
            {error}
          </p>
        </Card>
      ) : null}

      {/* toolbar: search + role-filter pills */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 max-w-sm flex-1 rounded-field bg-ink-50 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.04] dark:ring-white/10">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 dark:text-ink-500">
            <Icon name="search" className="h-4 w-4" />
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search staff by name or email"
            placeholder="Search name or email…"
            className="h-11 w-full rounded-field bg-transparent pl-9 pr-3 text-sm text-ink-900 outline-none placeholder:text-ink-400 dark:text-white dark:placeholder:text-ink-500"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(['All', ...ROLE_OPTIONS.map((option) => option.value)] as const).map((role) => {
            const active = roleFilter === role;
            return (
              <button
                key={role}
                type="button"
                onClick={() => setRoleFilter(role)}
                className={`h-9 shrink-0 rounded-pill px-3.5 text-xs font-semibold ring-1 ring-inset transition ${
                  active
                    ? `${ENGINE_GRADIENT} text-white ring-transparent shadow-[0_6px_18px_-8px_rgba(124,58,237,0.8)]`
                    : 'bg-ink-50 text-ink-600 ring-ink-200 hover:bg-ink-100 dark:bg-white/[0.03] dark:text-ink-300 dark:ring-white/10 dark:hover:bg-white/[0.06]'
                }`}
              >
                {role === 'All' ? 'All' : roleLabel(role)}
              </button>
            );
          })}
        </div>
      </div>

      {/* staff table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {['Member', 'Role', 'Joined', 'Status'].map((header) => (
                  <th
                    key={header}
                    className="border-b border-ink-200 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500 dark:border-white/10 dark:text-ink-400"
                  >
                    {header}
                  </th>
                ))}
                <th
                  aria-label="Actions"
                  className="border-b border-ink-200 px-5 py-3 text-right dark:border-white/10"
                />
              </tr>
            </thead>
            <tbody>
              {shown.map((member) => {
                const isSelf = currentUserId !== null && member.userId === currentUserId;
                const rowBusy = busyId === member.id && pending;
                const status = STATUS_STYLES[member.status];
                return (
                  <tr
                    key={member.id}
                    className="border-b border-ink-200 transition-colors last:border-0 hover:bg-ink-50 dark:border-white/10 dark:hover:bg-white/[0.025]"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-500/15 dark:text-brand-200">
                          {initialsOf(member.name)}
                        </span>
                        <div className="min-w-0">
                          <p
                            className={`flex items-center gap-2 truncate font-semibold text-ink-900 dark:text-white ${
                              member.status === 'SUSPENDED' ? 'opacity-60' : ''
                            }`}
                          >
                            {member.name}
                            {isSelf ? <Badge>You</Badge> : null}
                          </p>
                          <p className="truncate text-xs text-ink-400 dark:text-ink-500">
                            {member.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={ROLE_TONE[member.role]}>{roleLabel(member.role)}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-ink-600 dark:text-ink-300">
                      {formatDate(member.joinedAt)}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={status.tone}>
                        <Dot c={status.dot} />
                        {status.label}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="relative flex justify-end">
                        <button
                          type="button"
                          aria-label={`Actions for ${member.name}`}
                          aria-expanded={menuFor === member.id}
                          disabled={rowBusy}
                          onClick={() => openMenu(member.id)}
                          className="grid h-9 w-9 place-items-center rounded-btn text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-40 dark:text-ink-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                        >
                          <Glyph name="dots" className="h-5 w-5" />
                        </button>
                        {menuFor === member.id && (
                          <>
                            <div
                              aria-hidden
                              className="fixed inset-0 z-30"
                              onClick={() => setMenuFor(null)}
                            />
                            <div className="absolute right-0 top-10 z-40 w-48 rounded-card bg-white p-1.5 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.6)] ring-1 ring-ink-200 backdrop-blur-xl dark:bg-ink-900/95 dark:ring-white/10">
                              {!pickingRole ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setPickingRole(true)}
                                    className="flex h-9 w-full items-center gap-2.5 rounded-btn px-2.5 text-left text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/[0.06]"
                                  >
                                    <Glyph name="key" className="h-4 w-4" />
                                    Change role
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isSelf}
                                    title={isSelf ? 'You can’t remove yourself' : undefined}
                                    onClick={() => {
                                      setMenuFor(null);
                                      setConfirmRemove(member);
                                    }}
                                    className="flex h-9 w-full items-center gap-2.5 rounded-btn px-2.5 text-left text-sm font-medium text-danger-600 transition-colors hover:bg-danger-50 disabled:pointer-events-none disabled:opacity-40 dark:text-danger-300 dark:hover:bg-danger-500/15"
                                  >
                                    <Icon name="trash" className="h-4 w-4" />
                                    Remove
                                  </button>
                                </>
                              ) : (
                                ROLE_OPTIONS.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => onRoleSelect(member, option.value)}
                                    className="flex h-9 w-full items-center gap-2.5 rounded-btn px-2.5 text-left text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/[0.06]"
                                  >
                                    <span
                                      aria-hidden
                                      className={`h-2 w-2 rounded-full ${ROLE_DOT[option.value]}`}
                                    />
                                    {option.label}
                                    {option.value === member.role && (
                                      <Icon name="check" className="ml-auto h-4 w-4" />
                                    )}
                                  </button>
                                ))
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && (
            <div className="py-16 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-card bg-ink-50 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.03] dark:ring-white/10">
                <Icon name="search" className="h-6 w-6 text-ink-400 dark:text-ink-500" />
              </div>
              <p className="mt-3 font-semibold text-ink-900 dark:text-white">No staff match</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">
                Try a different role or search term.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Role-downgrade confirmation, explaining the capabilities being given up. */}
      {confirmChange ? (
        <ConfirmDialog
          title={`Change ${confirmChange.member.name} to ${roleLabel(confirmChange.nextRole)}?`}
          confirmLabel="Change role"
          busy={pending}
          onCancel={() => setConfirmChange(null)}
          onConfirm={() => applyRole(confirmChange.member, confirmChange.nextRole)}
        >
          <p className="text-sm text-ink-600 dark:text-ink-300">
            This lowers their access. As a {roleLabel(confirmChange.nextRole)} they will lose:
          </p>
          {confirmChange.lost.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-600 dark:text-ink-300">
              {confirmChange.lost.map((perm) => (
                <li key={perm}>{PERMISSION_LABELS[perm]}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">No capabilities change.</p>
          )}
        </ConfirmDialog>
      ) : null}

      {/* Remove confirmation — removal revokes their sessions immediately. */}
      {confirmRemove ? (
        <ConfirmDialog
          title={`Remove ${confirmRemove.name}?`}
          confirmLabel="Remove"
          destructive
          busy={pending}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => applyRemove(confirmRemove)}
        >
          <p className="text-sm text-ink-600 dark:text-ink-300">
            They’ll lose access to {confirmRemove.email} immediately — their sessions are revoked
            and they’re removed from your staff. This can’t be undone (you’d need to re-invite
            them).
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

/**
 * A small centered modal used for both the downgrade and remove confirmations,
 * matching the reference modal chrome (bordered header/footer, glass panel).
 */
function ConfirmDialog({
  title,
  confirmLabel,
  destructive,
  busy,
  onCancel,
  onConfirm,
  children,
}: {
  title: string;
  confirmLabel: string;
  destructive?: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative w-full rounded-t-card bg-white shadow-[0_40px_100px_-24px_rgba(0,0,0,0.7)] ring-1 ring-ink-200 backdrop-blur-2xl dark:bg-ink-900/95 dark:ring-white/10 sm:max-w-md sm:rounded-card">
        <div className="border-b border-ink-200 px-5 py-4 dark:border-white/10 sm:px-6">
          <h2 className="font-display text-lg font-extrabold tracking-tight text-ink-900 dark:text-white">
            {title}
          </h2>
        </div>
        <div className="px-5 py-5 sm:px-6">{children}</div>
        <div className="flex items-center justify-end gap-2.5 border-t border-ink-200 px-5 py-4 dark:border-white/10 sm:px-6">
          <Btn v="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Btn>
          <Btn v={destructive ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}
