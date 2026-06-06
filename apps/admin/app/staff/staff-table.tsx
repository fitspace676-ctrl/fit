'use client';

import { type ReactNode, useState, useTransition } from 'react';
import {
  Permission,
  ROLE_PERMISSIONS,
  type StaffMember,
  type StaffRole,
  type StaffStatus,
} from '@fit/types';
import { ROLE_RANK } from '@/lib/auth-session';
import { removeStaffAction, updateStaffRoleAction } from './actions';

/** The roles a staff member can hold, high-to-low privilege, with their labels. */
const ROLE_OPTIONS: ReadonlyArray<{ value: StaffRole; label: string }> = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'RECEPTIONIST', label: 'Receptionist' },
  { value: 'TRAINER', label: 'Trainer' },
];

/** Human-readable copy for each capability, used to explain what a downgrade loses. */
const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.GymManage]: 'Manage gym settings',
  [Permission.StaffManage]: 'Invite & manage staff',
  [Permission.MemberRead]: 'View members',
  [Permission.MemberWrite]: 'Add & edit members',
  [Permission.TrainerRead]: 'View trainers',
  [Permission.TrainerWrite]: 'Add & edit trainers',
  [Permission.LocationRead]: 'View locations',
  [Permission.LocationWrite]: 'Add & edit locations',
  [Permission.ProductRead]: 'View products',
  [Permission.ProductWrite]: 'Add & edit products',
  [Permission.BillingRead]: 'View billing',
  [Permission.BillingManage]: 'Manage billing & plans',
  [Permission.WorkoutRead]: 'View workout plans',
  [Permission.WorkoutWrite]: 'Create & assign workouts',
  [Permission.ReportView]: 'View reports',
};

/** Visual treatment per staff status — green active, slate invited, amber suspended. */
const STATUS_STYLES: Record<StaffStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-emerald-50 text-emerald-700' },
  INVITED: { label: 'Invited', className: 'bg-slate-100 text-slate-600' },
  SUSPENDED: { label: 'Suspended', className: 'bg-amber-50 text-amber-700' },
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

/**
 * The active-staff table (T4.7). Server-rendered data, client-side interaction:
 * each row carries a role <select> and a Remove button. Re-roling to a
 * lower-privilege role opens a confirmation modal spelling out the capabilities
 * that will be lost (per the spec); an upgrade or sideways move applies straight
 * away. Removing a staff member always confirms first, since it revokes their
 * access immediately. Every mutation runs through a Server Action and the page
 * revalidates, so the table reflects the API's view rather than optimistic local
 * state. The signed-in owner's own row is flagged and can't be self-removed here.
 */
export function StaffTable({
  staff,
  currentUserId,
}: {
  staff: StaffMember[];
  currentUserId: string | null;
}) {
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

  if (staff.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
        No staff yet. Invite someone to get started.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Role</th>
              <th className="py-2 pr-4 font-medium" />
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => {
              const isSelf = currentUserId !== null && member.userId === currentUserId;
              const rowBusy = busyId === member.id && pending;
              const status = STATUS_STYLES[member.status];
              return (
                <tr key={member.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                  <td className="py-2 pr-4">
                    <div className="font-medium text-slate-900">
                      {member.name}
                      {isSelf ? (
                        <span className="ml-2 rounded-card bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700">
                          You
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-500">{member.email}</div>
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded-card px-2 py-0.5 text-xs font-medium ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      aria-label={`Role for ${member.name}`}
                      value={member.role}
                      disabled={rowBusy}
                      onChange={(e) => onRoleSelect(member, e.target.value as StaffRole)}
                      className="rounded-card border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 disabled:opacity-50"
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <button
                      type="button"
                      disabled={rowBusy || isSelf}
                      title={isSelf ? 'You can’t remove yourself' : undefined}
                      onClick={() => setConfirmRemove(member)}
                      className="rounded-card border border-red-200 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Role-downgrade confirmation, explaining the capabilities being given up. */}
      {confirmChange ? (
        <ConfirmDialog
          title={`Change ${confirmChange.member.name} to ${roleLabel(confirmChange.nextRole)}?`}
          confirmLabel="Change role"
          busy={pending}
          onCancel={() => setConfirmChange(null)}
          onConfirm={() => applyRole(confirmChange.member, confirmChange.nextRole)}
        >
          <p className="text-sm text-slate-600">
            This lowers their access. As a {roleLabel(confirmChange.nextRole)} they will lose:
          </p>
          {confirmChange.lost.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
              {confirmChange.lost.map((perm) => (
                <li key={perm}>{PERMISSION_LABELS[perm]}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No capabilities change.</p>
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
          <p className="text-sm text-slate-600">
            They’ll lose access to {confirmRemove.email} immediately — their sessions are revoked
            and they’re removed from your staff. This can’t be undone (you’d need to re-invite
            them).
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

/** The display label for a staff role. */
function roleLabel(role: StaffRole): string {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

/** A small centered modal used for both the downgrade and remove confirmations. */
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
    >
      <div className="w-full max-w-md rounded-card bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <div className="mt-3">{children}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-card border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-card px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
