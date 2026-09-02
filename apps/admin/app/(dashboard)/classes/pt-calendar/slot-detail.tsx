'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { serviceLabel, type AdminServiceSession, type ServiceSessionStatus } from '@fit/types';
import { Badge, Button, Card, type BadgeTone } from '@fit/ui-kit';
import { createDateTimeFormat, createNumberFormat } from '@fit/i18n';
import { Icon } from '@/components/ui';
import type { useSlideDrawer } from '@/hooks/use-slide-drawer';
import { zonedClock, zonedIsoDate } from '../schedule/week';
import { cancelServiceSessionAction, completeServiceSessionAction } from './pt-session-actions';

const STATUS_TONE: Record<ServiceSessionStatus, BadgeTone> = {
  OPEN: 'neutral',
  BOOKED: 'positive',
  COMPLETED: 'neutral',
  CANCELLED: 'danger',
};

const styles = stylex.create({
  drawer: {
    height: 'calc(100dvh - 1.5rem)',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    backgroundColor: 'var(--color-background-body)',
    boxShadow: 'var(--shadow-high)',
  },
  drawerHead: { paddingBlock: '0.5rem' },
  drawerContent: { padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  cover: {
    width: '100%',
    aspectRatio: '16 / 9',
    objectFit: 'cover',
    borderRadius: 'var(--radius-element)',
  },
  row: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  label: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
  },
  value: { fontSize: '0.9375rem', color: 'var(--color-text-primary)' },
  actions: { display: 'flex', gap: '0.75rem', marginTop: '0.5rem' },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: { width: '1.25rem', height: '1.25rem', flexShrink: 0, color: 'var(--color-error)' },
  errorText: { margin: 0, fontSize: '0.875rem', color: 'var(--color-error)' },
});

/** `HH:MM` on the gym's clock - `createDateTimeFormat` reads UTC, so it must not do this. */
const clock = (iso: string, timeZone: string) => zonedClock(new Date(iso), timeZone);

/** The slot's detail drawer: service, staff, when, member, invoice; cancel / complete. */
export function SlotDetail({
  drawer,
  slot,
  locale,
  timeZone,
  canWrite,
  onChanged,
}: {
  drawer: ReturnType<typeof useSlideDrawer>;
  slot: AdminServiceSession | null;
  locale: string;
  timeZone: string;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations('admin.services.sessions');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!slot) return null;

  // The calendar day on the gym's clock, formatted as a UTC-midnight token (the
  // formatter reads UTC fields).
  const when = createDateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${zonedIsoDate(new Date(slot.startsAt), timeZone)}T00:00:00.000Z`));
  const money = (minor: number, currency: string) =>
    createNumberFormat(locale, { style: 'currency', currency }).format(minor / 100);

  function run(action: (id: string) => Promise<{ ok: boolean; error?: string }>): void {
    if (!slot) return;
    setError(null);
    const id = slot.id;
    startTransition(async () => {
      const result = await action(id);
      if (result.ok) {
        onChanged();
        drawer.requestClose();
      } else {
        setError(result.error ?? t('unexpected'));
      }
    });
  }

  return (
    <Dialog
      isOpen={drawer.isOpen}
      onOpenChange={drawer.handleOpenChange}
      purpose="info"
      aria-label={t('slot')}
      width="30rem"
      maxHeight="100dvh"
      position={{ top: '0.75rem', right: '0.75rem', bottom: '0.75rem' }}
      padding={6}
      xstyle={[styles.drawer, drawer.motion]}
    >
      <Layout
        height="fill"
        header={
          <DialogHeader
            title={t('slot')}
            hasDivider={false}
            onOpenChange={drawer.handleOpenChange}
            xstyle={styles.drawerHead}
          />
        }
        content={
          <LayoutContent padding={0} isScrollable xstyle={styles.drawerContent}>
            {slot.serviceCoverUrl ? (
              <img src={slot.serviceCoverUrl} alt="" {...stylex.props(styles.cover)} />
            ) : null}
            <div {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.label)}>{t('service')}</span>
              <span {...stylex.props(styles.value)}>
                {serviceLabel(slot.serviceName, slot.staffName)}
              </span>
            </div>
            <div {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.label)}>{t('when')}</span>
              <span {...stylex.props(styles.value)}>
                {when} · {clock(slot.startsAt, timeZone)}-{clock(slot.endsAt, timeZone)} ·{' '}
                {t('durationHint', { count: slot.durationMinutes })}
              </span>
            </div>
            <div {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.label)}>{t('status')}</span>
              <span>
                <Badge tone={STATUS_TONE[slot.status]} label={t(`statusLabel.${slot.status}`)} />
              </span>
            </div>
            <div {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.label)}>{t('member')}</span>
              <span {...stylex.props(styles.value)}>{slot.memberName ?? t('nobodyYet')}</span>
            </div>
            {slot.invoice ? (
              <div {...stylex.props(styles.row)}>
                <span {...stylex.props(styles.label)}>{t('invoice')}</span>
                <span {...stylex.props(styles.value)}>
                  {slot.invoice.number} · {money(slot.invoice.amount, slot.invoice.currency)} ·{' '}
                  {t(`invoiceStatus.${slot.invoice.status}`)}
                </span>
              </div>
            ) : null}
            {slot.notes ? (
              <div {...stylex.props(styles.row)}>
                <span {...stylex.props(styles.label)}>{t('notes')}</span>
                <span {...stylex.props(styles.value)}>{slot.notes}</span>
              </div>
            ) : null}

            {error ? (
              <Card padding="none" xstyle={styles.errorCard}>
                <Icon name="info" {...stylex.props(styles.errorIcon)} />
                <p role="alert" {...stylex.props(styles.errorText)}>
                  {error}
                </p>
              </Card>
            ) : null}

            {canWrite && (slot.status === 'OPEN' || slot.status === 'BOOKED') ? (
              <div {...stylex.props(styles.actions)}>
                {slot.status === 'BOOKED' ? (
                  <Button
                    variant="primary"
                    size="card"
                    onClick={() => run(completeServiceSessionAction)}
                    disabled={pending}
                    label={t('markComplete')}
                  />
                ) : null}
                <Button
                  variant="secondary"
                  size="card"
                  onClick={() => run(cancelServiceSessionAction)}
                  disabled={pending}
                  label={t('cancelSlot')}
                />
              </div>
            ) : null}
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
