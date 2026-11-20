'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Button, ConfirmDialog } from '@fit/ui-kit';
import { useToast } from '@/components/ui';
import { liftBookingBlockAction } from '../actions';

const styles = stylex.create({
  action: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-text-secondary)',
  },
});

/** Shared by the profile banner and the class hub's blocked-member list. */
export function BookingBlockAction({ blockId }: { blockId: string }) {
  const t = useTranslations('admin.bookingBlocks');
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function lift() {
    setError(null);
    startTransition(async () => {
      const result = await liftBookingBlockAction(blockId);
      if (result.ok) {
        setOpen(false);
        toast(t('lifted'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }
  return (
    <>
      <Button
        variant="secondary"
        size="card"
        xstyle={styles.action}
        label={t('lift')}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      />
      <ConfirmDialog
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        onConfirm={lift}
        title={t('confirmTitle')}
        description={error ?? t('confirmDescription')}
        confirmLabel={t('lift')}
        cancelLabel={t('cancel')}
        loading={pending}
      />
    </>
  );
}
