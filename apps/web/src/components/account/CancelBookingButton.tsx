'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { useRouter } from '@/src/i18n/navigation';
import { useToast } from '@/src/components/ui';
import { cancelBookingAction } from '@/app/actions/bookings';

export interface CancelBookingButtonProps {
  /** The class occurrence id whose booking should be canceled. */
  classId: string;
  /** The class title, woven into the confirmation copy. */
  classTitle: string;
}

/**
 * Cancel a member's upcoming booking, gated behind an Astryx `AlertDialog`
 * confirmation (T11.14). The trigger is an Astryx ghost `Button`; confirming runs
 * the existing {@link cancelBookingAction} server action, surfaces a success or
 * error toast (mapping the API's error code to a friendly line), then refreshes
 * the route so the list and status badges reflect the change. The dialog stays
 * open with a spinner while the action is in flight and only closes on success.
 */
export function CancelBookingButton({ classId, classTitle }: CancelBookingButtonProps) {
  const t = useTranslations('account.bookings');
  const ta = useTranslations('member.actions');
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm(): void {
    startTransition(async () => {
      const result = await cancelBookingAction(classId);
      if (result.ok) {
        toast(ta('canceled'), { tone: 'ink', icon: 'check' });
        setOpen(false);
        router.refresh();
      } else {
        toast(ta(messageKey(result.code)), { tone: 'danger', icon: 'x' });
      }
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        label={t('cancel')}
        onClick={() => setOpen(true)}
        isDisabled={pending}
      />
      <AlertDialog
        isOpen={open}
        onOpenChange={(next) => {
          // Ignore the dialog's own close while a cancel is mid-flight.
          if (!pending) setOpen(next);
        }}
        title={t('confirm.title')}
        description={t('confirm.description', { title: classTitle })}
        cancelLabel={t('confirm.keep')}
        actionLabel={t('confirm.confirm')}
        actionVariant="destructive"
        isActionLoading={pending}
        onAction={confirm}
      />
    </>
  );
}

/** Map an API error code to a friendly i18n key (falls back to a generic error). */
function messageKey(code?: string): string {
  switch (code) {
    case 'CANCELLATION_WINDOW_PASSED':
      return 'errWindowPassed';
    case 'BOOKING_NOT_FOUND':
      return 'errNotFound';
    case 'UNAUTHENTICATED':
      return 'errAuth';
    default:
      return 'errGeneric';
  }
}
