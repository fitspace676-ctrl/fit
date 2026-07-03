'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { ClassInstanceCard } from '@fit/types';
import { Link, usePathname } from '@/src/i18n/navigation';
import { useSession } from '@/hooks/use-session';
import { Badge, buttonClasses, Btn, Card, Drawer, Occupancy } from '@/src/components/ui';
import { BookingActionButton } from '@/src/components/member/booking-action-button';
import { formatTime } from './date-utils';

export interface ClassDetailDrawerProps {
  /** The class to show, or `null` when the drawer is closed. */
  instance: ClassInstanceCard | null;
  /** Close the drawer (overlay click, close button, or Esc). */
  onClose: () => void;
}

/**
 * Right-side sheet showing one class's details and the booking CTA.
 *
 * Built as a plain overlay + panel (the app has no shadcn `<Sheet>` yet). The
 * CTA is auth-gated: a signed-out visitor gets a link to `/login?from=<this
 * page, with the class preselected>` so they return here after signing in; a
 * signed-in member gets the real {@link BookingActionButton}, which runs the
 * booking server action and refreshes the seat counts.
 */
export function ClassDetailDrawer({ instance, onClose }: ClassDetailDrawerProps) {
  const t = useTranslations('classes');
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useSession();

  if (!instance) {
    return null;
  }

  const spotsLeft = Math.max(instance.capacity - instance.bookedCount, 0);
  const isFull = spotsLeft === 0;

  // Where login should send the visitor back to: this page, with the class
  // preselected so the drawer can reopen. next-intl's <Link> prefixes the
  // locale onto `/login`, and the login form validates this same-origin path.
  const returnParams = new URLSearchParams(searchParams?.toString() ?? '');
  returnParams.set('class', instance.id);
  const from = `/${locale}${pathname}?${returnParams.toString()}`;
  const loginHref = `/login?from=${encodeURIComponent(from)}`;

  return (
    <Drawer
      open={instance !== null}
      onClose={onClose}
      label={instance.title}
      accent={instance.color}
      hideHeader
    >
      <div className="flex items-start justify-between gap-4">
        <Badge tone="brand">{instance.category}</Badge>
        <Btn v="ghost" size="icon" icon="x" aria-label={t('drawer.close')} onClick={onClose} />
      </div>

      <h2 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">
        {instance.title}
      </h2>

      <dl className="flex flex-col gap-3 text-sm">
        <DetailRow label={t('drawer.time')}>
          <span className="font-mono tabular-nums">
            {formatTime(instance.startsAt, locale)} – {formatTime(instance.endsAt, locale)}
          </span>
        </DetailRow>
        {instance.trainerName ? (
          <DetailRow label={t('drawer.trainer')}>{instance.trainerName}</DetailRow>
        ) : null}
        {instance.locationName ? (
          <DetailRow label={t('drawer.location')}>{instance.locationName}</DetailRow>
        ) : null}
      </dl>

      <Card className="flex flex-col gap-1.5 p-4">
        <span className="text-sm font-medium text-ink-700 dark:text-ink-200">
          {t('drawer.capacity')}
        </span>
        <Occupancy value={instance.bookedCount} cap={instance.capacity} />
        <p
          className={`text-xs ${
            isFull ? 'text-danger-600 dark:text-danger-300' : 'text-ink-500 dark:text-ink-400'
          }`}
        >
          {isFull ? t('card.full') : t('card.spotsLeft', { count: spotsLeft })}
        </p>
      </Card>

      <div className="mt-auto pt-2">
        {user ? (
          <BookingActionButton
            classId={instance.id}
            action="book"
            label={isFull ? t('drawer.full') : t('drawer.book')}
            v="primary"
            size="lg"
            className="w-full"
          />
        ) : (
          <Link href={loginHref} className={buttonClasses('primary', 'lg', 'w-full')}>
            {t('drawer.signInToBook')}
          </Link>
        )}
      </div>
    </Drawer>
  );
}

/** A labelled detail line in the drawer's definition list. */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-500 dark:text-ink-400">{label}</dt>
      <dd className="text-right font-medium text-ink-900 dark:text-white">{children}</dd>
    </div>
  );
}
