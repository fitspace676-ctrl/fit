'use client';

import { useState, useTransition } from 'react';
import type { PendingInvite, StaffRole } from '@fit/types';
import { Badge, Btn, Card, Icon } from '@/components/ui';
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
      <Card className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <Icon name="bell" className="h-7 w-7 text-ink-300 dark:text-ink-500" />
        <p className="text-sm text-ink-500 dark:text-ink-400">No pending invitations.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {note ? (
        <p
          role="status"
          className="rounded-card bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-200"
        >
          {note}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-card bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:bg-danger-500/10 dark:text-danger-200"
        >
          {error}
        </p>
      ) : null}

      <Card className="overflow-hidden">
        <ul className="flex flex-col divide-y divide-ink-100 dark:divide-white/10">
          {invites.map((invite) => {
            const rowBusy = busyId === invite.id && pending;
            return (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink-900 dark:text-white">{invite.email}</span>
                    {invite.expired ? <Badge tone="warning">Expired</Badge> : null}
                  </div>
                  <div className="text-xs text-ink-500 dark:text-ink-400">
                    {ROLE_LABELS[invite.role]} ·{' '}
                    {invite.expired
                      ? `expired ${formatDate(invite.expiresAt)}`
                      : `expires ${formatDate(invite.expiresAt)}`}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Btn v="outline" size="sm" disabled={rowBusy} onClick={() => resend(invite)}>
                    Resend
                  </Btn>
                  <Btn v="ghost" size="sm" disabled={rowBusy} onClick={() => revoke(invite)}>
                    Revoke
                  </Btn>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
