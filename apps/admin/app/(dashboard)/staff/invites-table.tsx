'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { PendingInvite } from '@fit/types';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Dot,
  EmptyState,
  type Column,
} from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { ROLE_TONES } from './role-meta';
import { inviteStaffAction, revokeInviteAction } from './actions';
import { createDateTimeFormat } from '@fit/i18n';

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  noteCard: {
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    backgroundColor: 'var(--color-accent-muted)',
  },
  noteText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-accent)',
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
  email: {
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  mono: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  expiresRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  badgeGap: {
    gap: '0.375rem',
  },
  expiresMuted: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
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
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.5rem',
  },
  dangerBtn: {
    color: 'var(--color-error)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-error-muted)',
    },
  },
});

/** Render an ISO instant as a short local date, or an em dash when absent/invalid. */
function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '-'
    : createDateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(
        date,
      );
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
      cell: (invite) => <span {...stylex.props(styles.email)}>{invite.email}</span>,
    },
    {
      key: 'role',
      header: t('invites.columns.role'),
      cell: (invite) => <Badge tone={ROLE_TONES[invite.role]} label={t(`roles.${invite.role}`)} />,
    },
    {
      key: 'sent',
      header: t('invites.columns.sent'),
      cell: (invite) => (
        <span {...stylex.props(styles.mono)}>{formatDate(invite.createdAt, locale)}</span>
      ),
    },
    {
      key: 'expires',
      header: t('invites.columns.expires'),
      cell: (invite) =>
        invite.expired ? (
          <div {...stylex.props(styles.expiresRow)}>
            <Badge
              tone="pending"
              label={
                <>
                  <Dot tone="neutral" /> {t('invites.expired')}
                </>
              }
            />
            <span {...stylex.props(styles.expiresMuted)}>
              {formatDate(invite.expiresAt, locale)}
            </span>
          </div>
        ) : (
          <span {...stylex.props(styles.mono)}>{formatDate(invite.expiresAt, locale)}</span>
        ),
    },
    {
      key: 'actions',
      header: <span {...stylex.props(styles.srOnly)}>{t('invites.columns.actions')}</span>,
      align: 'right',
      cell: (invite) => {
        if (!canManage) return null;
        const rowBusy = busyId === invite.id && pending;
        return (
          <div {...stylex.props(styles.actions)}>
            <Button
              variant="secondary"
              size="inline"
              onClick={() => resend(invite)}
              disabled={rowBusy}
              label={t('invites.resend')}
            />
            <Button
              variant="ghost"
              size="inline"
              onClick={() => setConfirmRevoke(invite)}
              disabled={rowBusy}
              label={t('invites.revoke')}
            />
          </div>
        );
      },
    },
  ];

  return (
    <div {...stylex.props(styles.stack)}>
      {note ? (
        <Card padding="none" xstyle={styles.noteCard}>
          <p role="status" {...stylex.props(styles.noteText)}>
            {note}
          </p>
        </Card>
      ) : null}
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
        rows={invites}
        rowKey={(invite) => invite.id}
        caption={t('invites.caption')}
        empty={
          <EmptyState
            icon={<Icon name="message" />}
            title={t('invites.emptyTitle')}
            body={t('invites.emptyHint')}
          />
        }
      />

      <ConfirmDialog
        open={confirmRevoke !== null}
        onClose={() => setConfirmRevoke(null)}
        onConfirm={() => confirmRevoke && revoke(confirmRevoke)}
        loading={pending}
        confirmVariant="destructive"
        confirmLabel={t('confirm.revokeConfirm')}
        cancelLabel={t('confirm.cancel')}
        title={t('confirm.revokeTitle')}
        description={confirmRevoke ? t('confirm.revokeBody', { email: confirmRevoke.email }) : ''}
      />
    </div>
  );
}
