'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/src/i18n/navigation';
import { Btn, useToast, type BtnVariant, type BtnSize } from '@/src/components/ui';
import { bookClassAction, cancelBookingAction } from '@/app/actions/bookings';

export interface BookingActionButtonProps {
  classId: string;
  action: 'book' | 'cancel';
  label: string;
  v?: BtnVariant;
  size?: BtnSize;
  className?: string;
  /** Disable (e.g. an already-full class with no waitlist desired). */
  disabled?: boolean;
}

/**
 * A self-contained book / cancel button: runs the matching server action, shows
 * a success or error toast (mapping the API's error code to a friendly line),
 * then refreshes the route so seat counts and lists reflect the change.
 */
export function BookingActionButton({
  classId,
  action,
  label,
  v = 'primary',
  size = 'sm',
  className = '',
  disabled = false,
}: BookingActionButtonProps) {
  const t = useTranslations('member.actions');
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(): void {
    startTransition(async () => {
      const result =
        action === 'book' ? await bookClassAction(classId) : await cancelBookingAction(classId);

      if (result.ok) {
        if (action === 'book') {
          const waitlisted = result.data.status === 'WAITLIST';
          toast(waitlisted ? t('waitlisted') : t('booked'), {
            tone: waitlisted ? 'warning' : 'success',
            icon: 'check',
          });
        } else {
          toast(t('canceled'), { tone: 'ink', icon: 'check' });
        }
        router.refresh();
      } else {
        toast(t(messageKey(result.code)), { tone: 'danger', icon: 'x' });
      }
    });
  }

  return (
    <Btn v={v} size={size} className={className} onClick={run} disabled={disabled || pending}>
      {pending ? t('working') : label}
    </Btn>
  );
}

/** Map an API error code to a friendly i18n key (falls back to a generic error). */
function messageKey(code?: string): string {
  switch (code) {
    case 'ALREADY_BOOKED':
      return 'errAlreadyBooked';
    case 'CLASS_NOT_BOOKABLE':
      return 'errNotBookable';
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
