'use client';

import { useState, useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import type { BookServiceSessionResult, ServiceCard, ServiceSlot } from '@fit/types';
import { Banner, Button, ButtonLink, Dialog } from '@/src/components/ui/kit';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { useSession } from '@/hooks/use-session';
import { Icon } from '@/src/components/ui';
import { formatMoney } from '@/lib/shop';
import { bookServiceSessionAction } from '@/app/actions/service-sessions';
import { formatZoned, formatZonedTime } from '../classes/date-utils';

const styles = stylex.create({
  facts: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  fact: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.9375rem',
    color: 'var(--color-text-primary)',
  },
  factIcon: { width: '1rem', height: '1rem', color: 'var(--color-text-secondary)', flexShrink: 0 },
  price: { fontFamily: 'var(--font-family-code)', fontWeight: 700 },
  hint: { margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
  done: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  invoice: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
  },
  invoiceLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
  },
  invoiceValue: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
});

type Phase = { step: 'idle'; error?: string } | { step: 'done'; result: BookServiceSessionResult };

export interface SlotBookingModalProps {
  slot: ServiceSlot;
  service: ServiceCard;
  timeZone: string;
  onClose: () => void;
  /** Called after a successful booking so the calendar drops the slot. */
  onBooked: () => void;
}

/**
 * Confirm-and-book for one slot. Signed out: a login link that returns here.
 * Signed in: "Book" claims the slot; the API raises the invoice in the same
 * transaction, and the done view shows its number and amount with a download
 * link — payment happens at the front desk.
 */
export function SlotBookingModal({
  slot,
  service,
  timeZone,
  onClose,
  onBooked,
}: SlotBookingModalProps) {
  const t = useTranslations('services.booking');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useSession();
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>({ step: 'idle' });

  const from = `/${locale}${pathname}`;
  const loginHref = `/member/login?from=${encodeURIComponent(from)}`;

  function book(): void {
    startTransition(async () => {
      const result = await bookServiceSessionAction(slot.id);
      if (result.ok) {
        setPhase({ step: 'done', result: result.data });
        onBooked();
        router.refresh();
      } else {
        setPhase({ step: 'idle', error: t(errorKey(result.code)) });
      }
    });
  }

  const title =
    service.type === 'PERSONAL_TRAINING'
      ? t('ptTitle', { staff: slot.staffName })
      : slot.serviceName;

  const facts = (
    <ul {...stylex.props(styles.facts)}>
      <li {...stylex.props(styles.fact)}>
        <Icon name="calendar" sw={2} {...stylex.props(styles.factIcon)} />
        {formatZoned(slot.startsAt, timeZone, locale, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      </li>
      <li {...stylex.props(styles.fact)}>
        <Icon name="clock" sw={2} {...stylex.props(styles.factIcon)} />
        {formatZonedTime(slot.startsAt, timeZone)}-{formatZonedTime(slot.endsAt, timeZone)} ·{' '}
        {t('minutes', { count: slot.durationMinutes })}
      </li>
      <li {...stylex.props(styles.fact)}>
        <Icon name="user" sw={2} {...stylex.props(styles.factIcon)} />
        {slot.staffName}
      </li>
      <li {...stylex.props(styles.fact)}>
        <Icon name="tag" sw={2} {...stylex.props(styles.factIcon)} />
        <span {...stylex.props(styles.price)}>
          {formatMoney(slot.priceMinor, slot.currency, locale)}
        </span>
      </li>
    </ul>
  );

  if (phase.step === 'done') {
    const invoice = phase.result.session.invoice;
    return (
      <Dialog
        open
        onClose={onClose}
        title={t('bookedTitle')}
        actions={<Button variant="primary" size="card" label={t('close')} onClick={onClose} />}
      >
        <div {...stylex.props(styles.done)}>
          {facts}
          {invoice ? (
            <div {...stylex.props(styles.invoice)}>
              <p {...stylex.props(styles.invoiceLabel)}>{t('invoice')}</p>
              <p {...stylex.props(styles.invoiceValue)}>
                {invoice.number} · {formatMoney(invoice.amount, invoice.currency, locale)}
              </p>
              <p {...stylex.props(styles.hint)}>{t('payAtDesk')}</p>
              <ButtonLink
                href={`/api/invoices/${invoice.id}`}
                variant="secondary"
                size="inline"
                label={t('downloadInvoice')}
              />
            </div>
          ) : null}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      dismissible={!pending}
      actions={
        user ? (
          <>
            <Button
              variant="secondary"
              size="card"
              label={t('cancel')}
              onClick={onClose}
              disabled={pending}
            />
            <Button
              variant="primary"
              size="card"
              label={pending ? t('booking') : t('book')}
              onClick={book}
              disabled={pending || isLoading}
            />
          </>
        ) : (
          <>
            <Button variant="secondary" size="card" label={t('cancel')} onClick={onClose} />
            <ButtonLink href={loginHref} variant="primary" size="card" label={t('signInToBook')} />
          </>
        )
      }
    >
      <div {...stylex.props(styles.done)}>
        {facts}
        <p {...stylex.props(styles.hint)}>{t('invoiceHint')}</p>
        {phase.error ? <Banner tone="error">{phase.error}</Banner> : null}
      </div>
    </Dialog>
  );
}

function errorKey(
  code: string | undefined,
): 'errors.taken' | 'errors.past' | 'errors.notMember' | 'errors.generic' {
  switch (code) {
    case 'SESSION_TAKEN':
      return 'errors.taken';
    case 'SESSION_PAST':
      return 'errors.past';
    case 'NOT_A_MEMBER':
    case 'MEMBER_SESSION_REQUIRED':
    case 'UNAUTHENTICATED':
      return 'errors.notMember';
    default:
      return 'errors.generic';
  }
}
