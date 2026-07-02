'use client';

import { useState, useTransition } from 'react';
import type { PendingInvite } from '@fit/types';
import { Badge, Btn, Card, Icon, useToast } from '@/components/ui';
import { Glyph } from './icons';
import { ROLE_TONE, roleLabel } from './role-meta';
import { inviteStaffAction, revokeInviteAction } from './actions';

/** Render an ISO instant as a short local date. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** A compact "2h" / "3d" age for the "Invite sent · …" microcopy. */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return 'just now';
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * The pending-invitations list (T4.7), the Invitations tab of the staff screen.
 * Each outstanding invite can be re-sent (mints a fresh link for the same email +
 * role) or revoked (deletes it so its link can no longer be redeemed). An expired
 * invite is flagged but kept in the list so staff can resend or clear it. Both
 * actions run through Server Actions and the page revalidates, so the list
 * reflects the API's view.
 */
export function PendingInvites({ invites }: { invites: PendingInvite[] }) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resend(invite: PendingInvite): void {
    setError(null);
    setBusyId(invite.id);
    startTransition(async () => {
      const result = await inviteStaffAction({ email: invite.email, role: invite.role });
      setBusyId(null);
      if (result.ok) {
        toast(`Invite re-sent to ${invite.email}`);
      } else {
        setError(result.error);
      }
    });
  }

  function revoke(invite: PendingInvite): void {
    setError(null);
    setBusyId(invite.id);
    startTransition(async () => {
      const result = await revokeInviteAction(invite.id);
      setBusyId(null);
      if (result.ok) {
        toast(`Invite to ${invite.email} revoked`);
      } else {
        setError(result.error);
      }
    });
  }

  if (invites.length === 0) {
    return (
      <Card className="py-16 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-card bg-ink-50 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.03] dark:ring-white/10">
          <Glyph name="mail" className="h-6 w-6 text-ink-400 dark:text-ink-500" />
        </div>
        <p className="mt-3 font-semibold text-ink-900 dark:text-white">No pending invitations</p>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Invite someone and they&rsquo;ll appear here until they accept.
        </p>
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

      <Card>
        <ul className="divide-y divide-ink-200 dark:divide-white/10">
          {invites.map((invite) => {
            const rowBusy = busyId === invite.id && pending;
            return (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-ink-50 dark:hover:bg-white/[0.025]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-warning-50 text-warning-600 ring-1 ring-warning-500/20 dark:bg-warning-500/15 dark:text-warning-300">
                    <Glyph name="mail" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink-900 dark:text-white">
                      {invite.email}
                      {invite.expired ? <Badge tone="warning">Expired</Badge> : null}
                    </p>
                    <p className="truncate text-xs text-ink-400 dark:text-ink-500">
                      Invite sent · {timeAgo(invite.createdAt)} ·{' '}
                      {invite.expired
                        ? `expired ${formatDate(invite.expiresAt)}`
                        : `expires ${formatDate(invite.expiresAt)}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={ROLE_TONE[invite.role]}>{roleLabel(invite.role)}</Badge>
                  <Btn v="outline" size="sm" disabled={rowBusy} onClick={() => resend(invite)}>
                    Resend
                  </Btn>
                  <Btn
                    v="ghost"
                    size="sm"
                    disabled={rowBusy}
                    onClick={() => revoke(invite)}
                    className="text-danger-600 hover:bg-danger-50 hover:text-danger-700 dark:text-danger-300 dark:hover:bg-danger-500/15 dark:hover:text-danger-200"
                  >
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
