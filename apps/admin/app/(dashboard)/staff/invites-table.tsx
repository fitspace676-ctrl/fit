'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { PendingInvite } from '@fit/types';
import {
  Badge,
  Btn,
  Card,
  ConfirmDialog,
  DataTable,
  Dot,
  EmptyState,
  Icon,
  type Column,
} from '@/components/ui';
import { ROLE_TONES } from './role-meta';
import { inviteStaffAction, revokeInviteAction } from './actions';

/** Render an ISO instant as a short local date, or an em dash when absent/invalid. */
function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The pending-invitations table (T2.10), rebuilt on the shared formacore
 * `DataTable`. Each outstanding invite can be re-sent (mints a fresh link for the
 * same email + role) or revoked (deletes it so its link can no longer be
 * redeemed) via the shared `ConfirmDialog`. An expired invite is flagged but kept
 * in the list so staff can resend or clear it. Both actions run through Server
 * Actions and the page revalidates, so the list reflects the API's view.
 */
export function InvitesTable({
  invites,
  canManage,
}: {
  invites: PendingInvite[];
  canManage: boolean;
}) {
  const t = useTranslations('admin.staff');
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<PendingInvite | null>(null);

  function resend(invite: PendingInvite): void {
    setError(null);
    setNote(null);
    setBusyId(invite.id);
    startTransition(async () => {
      const result = await inviteStaffAction({ email: invite.email, role: invite.role });
      setBusyId(null);
      if (result.ok) {
        setNote(t('invites.resendSuccess', { email: invite.email }));
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
      setConfirmRevoke(null);
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  const columns: Column<PendingInvite>[] = [
    {
      key: 'email',
      header: t('invites.columns.email'),
      className: 'font-medium text-ink-900 dark:text-white',
      cell: (invite) => invite.email,
    },
    {
      key: 'role',
      header: t('invites.columns.role'),
      cell: (invite) => <Badge tone={ROLE_TONES[invite.role]}>{t(`roles.${invite.role}`)}</Badge>,
    },
    {
      key: 'sent',
      header: t('invites.columns.sent'),
      className: 'font-mono tabular-nums text-ink-600 dark:text-ink-300',
      cell: (invite) => formatDate(invite.createdAt, locale),
    },
    {
      key: 'expires',
      header: t('invites.columns.expires'),
      cell: (invite) =>
        invite.expired ? (
          <div className="flex items-center gap-2">
            <Badge tone="warning" className="gap-1.5">
              <Dot c="bg-warning-400" />
              {t('invites.expired')}
            </Badge>
            <span className="font-mono text-xs tabular-nums text-ink-400">
              {formatDate(invite.expiresAt, locale)}
            </span>
          </div>
        ) : (
          <span className="font-mono tabular-nums text-ink-600 dark:text-ink-300">
            {formatDate(invite.expiresAt, locale)}
          </span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('invites.columns.actions')}</span>,
      align: 'right',
      headerClassName: 'pr-5',
      className: 'pr-5',
      cell: (invite) => {
        if (!canManage) return null;
        const rowBusy = busyId === invite.id && pending;
        return (
          <div className="flex justify-end gap-2">
            <Btn v="outline" size="sm" disabled={rowBusy} onClick={() => resend(invite)}>
              {t('invites.resend')}
            </Btn>
            <Btn
              v="ghost"
              size="sm"
              disabled={rowBusy}
              onClick={() => setConfirmRevoke(invite)}
              className="text-danger-700 hover:bg-danger-50 dark:text-danger-300 dark:hover:bg-danger-500/10"
            >
              {t('invites.revoke')}
            </Btn>
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {note ? (
        <Card className="bg-brand-50 px-3 py-2 dark:bg-brand-500/10">
          <p role="status" className="text-sm text-brand-700 dark:text-brand-200">
            {note}
          </p>
        </Card>
      ) : null}
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
        rows={invites}
        rowKey={(invite) => invite.id}
        caption={t('invites.caption')}
        empty={
          <EmptyState
            icon="message"
            title={t('invites.emptyTitle')}
            message={t('invites.emptyHint')}
          />
        }
      />

      <ConfirmDialog
        open={confirmRevoke !== null}
        onClose={() => setConfirmRevoke(null)}
        onConfirm={() => confirmRevoke && revoke(confirmRevoke)}
        busy={pending}
        danger
        confirmLabel={t('confirm.revokeConfirm')}
        cancelLabel={t('confirm.cancel')}
        title={t('confirm.revokeTitle')}
        message={confirmRevoke ? t('confirm.revokeBody', { email: confirmRevoke.email }) : ''}
      />
    </div>
  );
}
