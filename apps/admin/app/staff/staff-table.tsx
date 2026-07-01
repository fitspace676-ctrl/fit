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
import { Badge, Btn, Card, Icon, type Tone } from '@/components/ui';
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
  [Permission.PackageRead]: 'View package plans',
  [Permission.PackageWrite]: 'Add & edit package plans',
  [Permission.ClassRead]: 'View classes',
  [Permission.ClassWrite]: 'Add & edit classes',
  [Permission.ClassBook]: 'Book classes',
  [Permission.ReviewWrite]: 'Write reviews',
  [Permission.ReviewModerate]: 'Moderate reviews',
  [Permission.NotificationManage]: 'Manage push notifications',
  [Permission.BillingRead]: 'View billing',
  [Permission.BillingManage]: 'Manage billing & plans',
  [Permission.SubscriptionManage]: 'Freeze & resume own membership',
  [Permission.CreditPackManage]: 'Buy & view own class credits',
  [Permission.WorkoutRead]: 'View workout plans',
  [Permission.WorkoutWrite]: 'Create & assign workouts',
  [Permission.ReportView]: 'View reports',
  [Permission.AuditRead]: 'View audit log',
  [Permission.ProfileManage]: 'Edit own profile',
};

/** Visual treatment per staff status — green active, slate invited, amber suspended. */
const STATUS_STYLES: Record<StaffStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INVITED: { label: 'Invited', tone: 'ink' },
  SUSPENDED: { label: 'Suspended', tone: 'warning' },
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
      <Card className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <Icon name="users" className="h-8 w-8 text-ink-300 dark:text-ink-500" />
        <p className="text-sm text-ink-500 dark:text-ink-400">
          No staff yet. Invite someone to get started.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
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

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 dark:border-white/10">
                <th className="py-3 pl-5 pr-4 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  Name
                </th>
                <th className="py-3 pr-4 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  Status
                </th>
                <th className="py-3 pr-4 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  Role
                </th>
                <th className="py-3 pr-5 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400" />
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => {
                const isSelf = currentUserId !== null && member.userId === currentUserId;
                const rowBusy = busyId === member.id && pending;
                const status = STATUS_STYLES[member.status];
                return (
                  <tr
                    key={member.id}
                    className="border-b border-ink-50 last:border-0 hover:bg-ink-50 dark:border-white/5 dark:hover:bg-white/[0.04]"
                  >
                    <td className="py-3 pl-5 pr-4">
                      <div className="flex items-center gap-2 font-medium text-ink-900 dark:text-white">
                        {member.name}
                        {isSelf ? <Badge tone="brand">You</Badge> : null}
                      </div>
                      <div className="text-xs text-ink-500 dark:text-ink-400">{member.email}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        aria-label={`Role for ${member.name}`}
                        value={member.role}
                        disabled={rowBusy}
                        onChange={(e) => onRoleSelect(member, e.target.value as StaffRole)}
                        className="h-9 rounded-field border border-ink-200 bg-white px-3 text-sm text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-200"
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-5 text-right">
                      <Btn
                        v="outline"
                        size="sm"
                        disabled={rowBusy || isSelf}
                        title={isSelf ? 'You can’t remove yourself' : undefined}
                        onClick={() => setConfirmRemove(member)}
                        className="text-danger-700 hover:bg-danger-50 dark:text-danger-300 dark:hover:bg-danger-500/10"
                      >
                        Remove
                      </Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 px-4 backdrop-blur-sm"
    >
      <Card className="w-full max-w-md p-6">
        <h2 className="font-display text-lg font-bold text-ink-900 dark:text-white">{title}</h2>
        <div className="mt-3">{children}</div>
        <div className="mt-6 flex justify-end gap-3">
          <Btn v="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Btn>
          <Btn
            v={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </Btn>
        </div>
      </Card>
    </div>
  );
}
