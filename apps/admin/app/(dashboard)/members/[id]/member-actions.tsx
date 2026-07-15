'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { MEMBER_TRASH_RETENTION_DAYS, type MemberStatus } from '@fit/types';
import { Btn, ConfirmDialog, Icon, useToast } from '@/components/ui';
import { setMemberActiveAction, setMemberTrashedAction } from '../actions';

const styles = stylex.create({
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '0.5rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  editLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    height: '2.25rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: 'var(--color-text-primary)',
  },
  editIcon: {
    width: '1rem',
    height: '1rem',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    paddingInline: '0.75rem',
    paddingBlock: '0.375rem',
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
});

/**
 * The member detail page's write controls (T4.3), shown only to `MemberWrite`
 * staff (the server component gates rendering).
 *
 * A trashed member (soft-deleted, `deletedAt` set) collapses to a single
 * **Restore** button — every live-member control is meaningless in trash. A live
 * member gets the full set: an "Edit" link, a deactivate / reactivate toggle
 * (a suspended member reactivates, any other status deactivates), and a
 * **Move to trash** action behind a confirm dialog (destructive — it drops the
 * member from the roster and every live count until the purge cron removes it).
 * Lifecycle calls go through {@link setMemberActiveAction} /
 * {@link setMemberTrashedAction}; on success the router refreshes so the header
 * and trash banner reflect the new state.
 */
export function MemberActions({
  memberId,
  status,
  deletedAt,
}: {
  memberId: string;
  status: MemberStatus;
  deletedAt: string | null;
}) {
  const t = useTranslations('admin.members');
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmTrash, setConfirmTrash] = useState(false);

  const isTrashed = deletedAt !== null;
  const isSuspended = status === 'SUSPENDED';

  function toggleActive(): void {
    setError(null);
    startTransition(async () => {
      const result = await setMemberActiveAction(memberId, isSuspended);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function setTrashed(trashed: boolean): void {
    setError(null);
    startTransition(async () => {
      const result = await setMemberTrashedAction(memberId, trashed);
      if (result.ok) {
        setConfirmTrash(false);
        toast(trashed ? t('trash.toastTrashed') : t('trash.toastRestored'), {
          tone: 'success',
          icon: 'check',
        });
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.row)}>
        {isTrashed ? (
          <Btn
            v="primary"
            size="sm"
            icon="arrowLeft"
            onClick={() => setTrashed(false)}
            disabled={pending}
          >
            {pending ? t('form.saving') : t('trash.restore')}
          </Btn>
        ) : (
          <>
            <Link href={`/members/${memberId}/edit`} {...stylex.props(styles.editLink)}>
              <Icon name="settings" sw={2} {...stylex.props(styles.editIcon)} />
              {t('actions.edit')}
            </Link>
            <Btn
              v={isSuspended ? 'primary' : 'outline'}
              size="sm"
              onClick={toggleActive}
              disabled={pending}
            >
              {pending
                ? t('form.saving')
                : isSuspended
                  ? t('actions.reactivate')
                  : t('actions.deactivate')}
            </Btn>
            <Btn
              v="ghost"
              size="sm"
              icon="trash"
              onClick={() => setConfirmTrash(true)}
              disabled={pending}
            >
              {t('trash.moveToTrash')}
            </Btn>
          </>
        )}
      </div>
      {error ? (
        <Card variant="default" padding={0} xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {error}
          </p>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirmTrash}
        onClose={() => setConfirmTrash(false)}
        onConfirm={() => setTrashed(true)}
        title={t('trash.confirmTitle')}
        message={t('trash.confirmMessage', { days: MEMBER_TRASH_RETENTION_DAYS })}
        confirmLabel={t('trash.moveToTrash')}
        cancelLabel={t('form.cancel')}
        danger
        busy={pending}
      />
    </div>
  );
}
