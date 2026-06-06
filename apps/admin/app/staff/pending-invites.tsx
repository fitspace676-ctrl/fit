'use client';

import { useState, useTransition } from 'react';
import type { PendingInvite, StaffRole } from '@fit/types';
import { inviteStaffAction, revokeInviteAction } from './actions';

/** Display labels for the assignable staff roles. */
const ROLE_LABELS: Record<StaffRole, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  RECEPTIONIST: 'Receptionist',
  TRAINER: 'Trainer',
};

/** Render an ISO instant as a short local date. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The pending-invitations list (T4.7). Each outstanding invite can be re-sent
 * (mints a fresh link for the same email + role) or revoked (deletes it so its
 * link can no longer be redeemed). An expired invite is flagged but kept in the
 * list so staff can resend or clear it. Both actions run through Server Actions
 * and the page revalidates, so the list reflects the API's view.
 */
export function PendingInvites({ invites }: { invites: PendingInvite[] }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function resend(invite: PendingInvite): void {
    setError(null);
    setNote(null);
    setBusyId(invite.id);
    startTransition(async () => {
      const result = await inviteStaffAction({ email: invite.email, role: invite.role });
      setBusyId(null);
      if (result.ok) {
        setNote(`Invitation re-sent to ${invite.email}.`);
      } else {
        setError(result.error);
      }
    });
  }

  function revoke(invite: PendingInvite): void {
    setError(null);
    setNote(null);
    setBusyId(invite.id);
    startTransition(async () => {
      const result = await revokeInviteAction(invite.id);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  if (invites.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
        No pending invitations.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {note ? (
        <p role="status" className="rounded-card bg-brand-50 px-3 py-2 text-sm text-brand-700">
          {note}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <ul className="flex flex-col divide-y divide-slate-100 rounded-card border border-slate-200 bg-white">
        {invites.map((invite) => {
          const rowBusy = busyId === invite.id && pending;
          return (
            <li
              key={invite.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{invite.email}</span>
                  {invite.expired ? (
                    <span className="rounded-card bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                      Expired
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-slate-500">
                  {ROLE_LABELS[invite.role]} ·{' '}
                  {invite.expired
                    ? `expired ${formatDate(invite.expiresAt)}`
                    : `expires ${formatDate(invite.expiresAt)}`}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={rowBusy}
                  onClick={() => resend(invite)}
                  className="rounded-card border border-brand-200 px-3 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40"
                >
                  Resend
                </button>
                <button
                  type="button"
                  disabled={rowBusy}
                  onClick={() => revoke(invite)}
                  className="rounded-card border border-slate-200 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Revoke
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
