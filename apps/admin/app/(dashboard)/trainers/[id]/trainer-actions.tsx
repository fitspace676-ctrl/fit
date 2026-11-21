'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { TrainerStatus } from '@fit/types';
import { Button, ConfirmDialog } from '@fit/ui-kit';
import { useToast, Icon } from '@/components/ui';
import { deleteTrainerAction, trainerDeleteImpactAction, setTrainerActiveAction } from '../actions';

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
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':hover': 'var(--color-background-muted)',
    },
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
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.375rem',
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
 * The trainer detail page's write controls (T4.4), shown only to `TrainerWrite`
 * staff (the server component gates rendering). An "Edit" link plus a deactivate /
 * reactivate toggle: an inactive trainer can be reactivated, an active one
 * deactivated. The lifecycle call goes through {@link setTrainerActiveAction}; on
 * success the router refreshes so the header pill reflects the new status, and any
 * error surfaces inline.
 */
export function TrainerActions({
  trainerId,
  status,
  canDelete,
}: {
  trainerId: string;
  status: TrainerStatus;
  canDelete: boolean;
}) {
  const t = useTranslations('admin.trainers');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();
  const [impact, setImpact] = useState<{ classes: number; ptSessions: number } | null>(null);

  function prepareDelete(): void {
    setError(null);
    startTransition(async () => {
      const result = await trainerDeleteImpactAction(trainerId);
      if (result.ok) setImpact(result.data);
      else setError(result.error);
    });
  }

  function remove(): void {
    startTransition(async () => {
      const result = await deleteTrainerAction(trainerId);
      if (result.ok) {
        toast(t('detail.deleted'), { tone: 'success', icon: 'check' });
        router.push('/trainers');
        router.refresh();
      } else {
        setImpact(null);
        setError(result.error);
      }
    });
  }

  const isInactive = status === 'INACTIVE';

  function toggle(): void {
    setError(null);
    startTransition(async () => {
      const result = await setTrainerActiveAction(trainerId, isInactive);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.row)}>
        <Link href={`/trainers/${trainerId}/edit`} {...stylex.props(styles.editLink)}>
          <Icon name="settings" sw={2} {...stylex.props(styles.editIcon)} />
          {t('detail.edit')}
        </Link>
        <Button
          variant="secondary"
          size="inline"
          onClick={toggle}
          disabled={pending}
          label={
            pending
              ? t('form.saving')
              : isInactive
                ? t('detail.reactivate')
                : t('detail.deactivate')
          }
        />
        {canDelete ? (
          <Button
            variant="destructive"
            size="inline"
            onClick={prepareDelete}
            disabled={pending}
            label={t('detail.delete')}
          />
        ) : null}
      </div>
      <ConfirmDialog
        open={impact !== null}
        onClose={() => setImpact(null)}
        onConfirm={remove}
        loading={pending}
        confirmVariant="destructive"
        confirmLabel={t('detail.delete')}
        cancelLabel={t('detail.cancelDelete')}
        title={t('detail.deleteTitle')}
        description={t('detail.deleteBody', {
          classes: impact?.classes ?? 0,
          ptSessions: impact?.ptSessions ?? 0,
        })}
      />
      {error ? (
        <div {...stylex.props(styles.errorCard)}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {error}
          </p>
        </div>
      ) : null}
    </div>
  );
}
