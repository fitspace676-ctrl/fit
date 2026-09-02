'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { serviceLabel } from '@fit/types';
import { Button } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { useSlideDrawer } from '@/hooks/use-slide-drawer';
import { zonedDayStart } from '../schedule/week';
import { createServiceSessionAction } from './pt-session-actions';

/** The slot the drawer opens on when the host pointed at a time on the grid. */
export interface SlotSeed {
  /** `YYYY-MM-DD` on the gym's calendar. */
  date: string;
  /** `HH:MM` on the gym's clock. */
  time: string;
}

/** A service the slot drawer can open a slot for. */
export interface ServiceOption {
  id: string;
  name: string;
  staffName: string;
  /** The gym's category the service is filed under, or null. */
  category: string | null;
  durationMinutes: number;
}

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
  triggerIcon: { width: '1rem', height: '1rem' },
  header: { paddingBlock: '0.5rem' },
  content: { padding: '1.5rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' },
  label: { fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' },
  hint: { fontSize: '0.75rem', color: 'var(--color-text-secondary)' },
  input: {
    height: '2.75rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '0.9375rem',
  },
  textarea: { minHeight: '4rem', paddingBlock: '0.625rem' },
  error: { fontSize: '0.8125rem', color: 'var(--color-error)' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem' },
});

/**
 * "Open a slot": pick a service, a date and a start time; the slot's length is
 * the service's duration and its staff member comes with the service. Members
 * then book the slot from the portal. The start is read on the gym's clock.
 */
export function AddSlotDrawer({
  services,
  defaultDate,
  timeZone,
  seed,
  openToken = 0,
}: {
  services: ServiceOption[];
  /** `YYYY-MM-DD` the date field opens on (the visible week's Monday). */
  defaultDate: string;
  timeZone: string;
  /**
   * Slot the form opens on, when the host opened this drawer by pointing at a
   * time rather than pressing the button - see {@link openToken}.
   */
  seed?: SlotSeed;
  /**
   * Opens the drawer from outside its own button: the calendar bumps this when a
   * staffer clicks an empty slot on the grid. A counter rather than a boolean so
   * clicking the same slot twice reopens the drawer both times.
   */
  openToken?: number;
}) {
  const t = useTranslations('admin.services.sessions');
  const drawer = useSlideDrawer();

  // `openToken` starts at 0 and only ever climbs, so this fires on a real request
  // from the host and never on mount.
  const lastToken = useRef(openToken);
  const openDrawer = drawer.open;
  useEffect(() => {
    if (openToken !== lastToken.current) {
      lastToken.current = openToken;
      openDrawer();
    }
  }, [openToken, openDrawer]);

  return (
    <>
      <Button
        variant="primary"
        size="block"
        label={t('openSlot')}
        icon={<Icon name="plus" sw={2} {...stylex.props(styles.triggerIcon)} />}
        onClick={drawer.open}
      />
      <Dialog
        isOpen={drawer.isOpen}
        onOpenChange={drawer.handleOpenChange}
        purpose="info"
        aria-label={t('openSlot')}
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
              title={t('openSlot')}
              hasDivider={false}
              onOpenChange={drawer.handleOpenChange}
              xstyle={styles.header}
            />
          }
          content={
            <LayoutContent padding={0} isScrollable xstyle={styles.content}>
              <SlotForm
                key={drawer.contentKey}
                services={services}
                defaultDate={seed?.date ?? defaultDate}
                defaultTime={seed?.time ?? '10:00'}
                timeZone={timeZone}
                onDone={drawer.requestClose}
              />
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}

function SlotForm({
  services,
  defaultDate,
  defaultTime,
  timeZone,
  onDone,
}: {
  services: ServiceOption[];
  defaultDate: string;
  defaultTime: string;
  timeZone: string;
  onDone: () => void;
}) {
  const t = useTranslations('admin.services.sessions');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(defaultTime);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const service = services.find((s) => s.id === serviceId) ?? null;

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    const [hh, mm] = time.split(':').map(Number);
    // The picked wall-clock time is on the gym's clock, not the browser's.
    const dayStart = zonedDayStart(new Date(`${date}T00:00:00.000Z`), timeZone);
    const startsAt = new Date(
      dayStart.getTime() + ((hh ?? 0) * 60 + (mm ?? 0)) * 60_000,
    ).toISOString();
    startTransition(async () => {
      const result = await createServiceSessionAction({ serviceId, startsAt, notes });
      if (result.ok) {
        onDone();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (services.length === 0) {
    return <p {...stylex.props(styles.hint)}>{t('noServices')}</p>;
  }

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
      <div {...stylex.props(styles.field)}>
        <label htmlFor="slot-service" {...stylex.props(styles.label)}>
          {t('service')}
        </label>
        <select
          id="slot-service"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          required
          {...stylex.props(styles.input)}
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {serviceLabel(s.name, s.staffName)}
              {s.category ? ` · ${s.category}` : ''}
            </option>
          ))}
        </select>
        {service ? (
          <p {...stylex.props(styles.hint)}>
            {t('durationHint', { count: service.durationMinutes })}
          </p>
        ) : null}
      </div>
      <div {...stylex.props(styles.row)}>
        <div {...stylex.props(styles.field)}>
          <label htmlFor="slot-date" {...stylex.props(styles.label)}>
            {t('date')}
          </label>
          <input
            id="slot-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            {...stylex.props(styles.input)}
          />
        </div>
        <div {...stylex.props(styles.field)}>
          <label htmlFor="slot-time" {...stylex.props(styles.label)}>
            {t('time')}
          </label>
          <input
            id="slot-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            {...stylex.props(styles.input)}
          />
        </div>
      </div>
      <div {...stylex.props(styles.field)}>
        <label htmlFor="slot-notes" {...stylex.props(styles.label)}>
          {t('notes')}
        </label>
        <textarea
          id="slot-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          {...stylex.props(styles.input, styles.textarea)}
        />
      </div>
      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      ) : null}
      <div {...stylex.props(styles.actions)}>
        <Button
          variant="secondary"
          size="page"
          label={t('cancel')}
          onClick={onDone}
          type="button"
        />
        <Button
          variant="primary"
          size="page"
          label={pending ? t('saving') : t('create')}
          type="submit"
          disabled={pending}
        />
      </div>
    </form>
  );
}
