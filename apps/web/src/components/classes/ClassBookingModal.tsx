'use client';

import { useEffect, useState, useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Badge, Banner, Button, ButtonLink, Card, Dialog } from '@/src/components/ui/kit';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { BookClassInstanceResult, ClassInstanceCard } from '@fit/types';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { useSession } from '@/hooks/use-session';
import { Icon } from '@/src/components/ui';
import { bookClassAction } from '@/app/actions/bookings';
import { ClassOccupancy } from './ClassOccupancy';
import { formatZoned, formatZonedDate, formatZonedTime } from './date-utils';

// The booking flow — one modal, used from everywhere a class can be booked.
//
// WHY A MODAL. Booking was a right-side sheet (`Drawer`) opened from the
// schedule, and a bare button on the detail page — two entry points with two
// different shapes for the same commitment. A sheet is the portal's shape for
// "more about this, alongside what you were doing"; booking is not that. It is
// a decision that wants the screen, and it is the same decision from the week
// grid, the list and the detail page. So it is one centred modal now, and the
// detail page's CTA opens it rather than acting on its own.
//
// WHY A FLOW, NOT A BUTTON. The old sheet had no outcome. You pressed "Book",
// the button spun, a toast flashed at the edge of the screen, and the sheet
// still said "Book" — nothing where you were looking told you whether you had a
// seat, and a waitlist placement never showed you your position at all. Note
// that the CANCEL path already ran behind a confirmation with an outcome; the
// commitment did not. The modal now carries the whole thing:
//
//   details  ──book──▶  pending  ──▶  booked / waitlisted (with position)
//                                └─▶  error, stated inline where the button was
//
// The success step is built on `classes.detail.booking.*` — a set of strings
// that has been sitting in the catalogue unused since the flow was specified.
// It was written for exactly this panel; nothing ever rendered it.
//
// The old sheet's per-category accent stripe is gone with it. The direction
// allows one chromatic voice and spends it on the lime block below; a hue per
// class type is precisely the decorative colour it removes. The category is
// still stated — as a chip, in ink.

const styles = stylex.create({
  // Wider than the kit's 26rem default: the lime block sets a clock at display
  // size, and at 26rem it wraps onto the line meant for the class it belongs to.
  panel: {
    maxWidth: '30rem',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  // The lime block, at modal scale — the same object as the bookings board's
  // "Next up" hero, so the class you are about to book and the class you have
  // booked are drawn the same way. Flat fill, ink type, no gradient or glow.
  hero: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '1.25rem',
    borderRadius: 'var(--radius-page)',
    backgroundColor: 'var(--color-accent)',
    padding: '1.25rem',
    color: '#131312',
  },
  heroTime: {
    flexShrink: 0,
  },
  // NOTE — every `<p>` on a lime block must state its colour. The theme's reset
  // carries `:where(p) { color: var(--color-text-primary) }`, which in dark mode
  // is white. It has zero specificity but it still beats plain inheritance, so a
  // paragraph here does NOT pick up the block's ink: it goes white on lime
  // (~1.5:1) unless told otherwise.
  heroClock: {
    margin: 0,
    color: '#131312',
    fontFamily: 'var(--font-family-code)',
    fontSize: 'clamp(2.25rem, 9vw, 2.75rem)',
    fontWeight: 700,
    lineHeight: 0.9,
    letterSpacing: '-0.05em',
    fontVariantNumeric: 'tabular-nums',
  },
  heroDuration: {
    margin: 0,
    marginTop: '0.375rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'rgba(19, 19, 18, 0.62)',
  },
  // Ink at 18%, not a border token: on lime every theme border reads as a
  // smudge. Hidden once the row wraps, where a vertical rule separates nothing.
  heroRule: {
    display: {
      default: 'none',
      '@media (min-width: 480px)': 'block',
    },
    alignSelf: 'stretch',
    width: '1px',
    flexShrink: 0,
    backgroundColor: 'rgba(19, 19, 18, 0.18)',
  },
  heroFacts: {
    minWidth: '10rem',
    flex: 1,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.875rem',
    color: 'rgba(19, 19, 18, 0.82)',
  },
  heroFact: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
  },
  heroFactIcon: {
    height: '0.875rem',
    width: '0.875rem',
    flexShrink: 0,
  },
  capCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '1rem',
  },
  capLabel: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    color: 'var(--color-text-secondary)',
  },
  spots: {
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  spotsFull: {
    color: 'var(--color-text-primary)',
  },
  /* -------------------------------- outcome ------------------------------- */
  // The one moment the flow earns a graphic: a lime disc with the tick, at the
  // top of the panel where the category chip was.
  outcome: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  outcomeDisc: {
    display: 'grid',
    placeItems: 'center',
    height: '2.75rem',
    width: '2.75rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  outcomeIcon: {
    height: '1.375rem',
    width: '1.375rem',
  },
  outcomeText: {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  position: {
    marginTop: '0.25rem',
  },
});

export interface ClassBookingModalProps {
  /** The class to book, or `null` when the modal is closed. */
  instance: ClassInstanceCard | null;
  /** Close it (scrim click, Close button, or Esc). */
  onClose: () => void;
  /**
   * The gym's IANA zone. Every time below is read in it rather than in the
   * viewer's — a class is a wall-clock commitment at the gym.
   */
  timeZone: string;
}

/** Where the flow has got to. `error` rides alongside `idle`, inline. */
type Phase =
  | { step: 'idle'; error: string | null }
  | { step: 'done'; result: BookClassInstanceResult };

/**
 * The booking modal: one class's details and the whole act of booking it, from
 * the schedule, the list, or the detail page.
 *
 * Auth-gated. A signed-out visitor gets a link to
 * `/member/login?from=<here, with the class preselected>` so they land back on
 * this modal after signing in; a signed-in member gets the real action, which
 * runs {@link bookClassAction}, states the outcome in place, and refreshes the
 * route so seat counts and booking lists catch up.
 */
export function ClassBookingModal({ instance, onClose, timeZone }: ClassBookingModalProps) {
  const t = useTranslations('classes');
  const ta = useTranslations('member.actions');
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useSession();

  const [phase, setPhase] = useState<Phase>({ step: 'idle', error: null });
  const [pending, startTransition] = useTransition();

  // Every open is a fresh flow: without this, reopening the modal on a different
  // class would show the previous class's success panel.
  const instanceId = instance?.id ?? null;
  useEffect(() => {
    setPhase({ step: 'idle', error: null });
  }, [instanceId]);

  if (!instance) {
    return null;
  }

  const spotsLeft = Math.max(instance.capacity - instance.bookedCount, 0);
  const isFull = spotsLeft === 0;

  function book(): void {
    const id = instance!.id;
    startTransition(async () => {
      const result = await bookClassAction(id);
      if (result.ok) {
        setPhase({ step: 'done', result: result.data });
        // The seat counts behind the modal are now stale — and so is the
        // bookings board, if that is where the member goes next.
        router.refresh();
      } else {
        setPhase({ step: 'idle', error: ta(messageKey(result.code)) });
      }
    });
  }

  // Where login should send the visitor back to: this page, with the class
  // preselected so the modal reopens. next-intl's <Link> prefixes the locale
  // onto `/member/login`, and the login form validates this same-origin path.
  const returnParams = new URLSearchParams(searchParams?.toString() ?? '');
  returnParams.set('class', instance.id);
  const from = `/${locale}${pathname}?${returnParams.toString()}`;
  const loginHref = `/member/login?from=${encodeURIComponent(from)}`;

  const waitlisted = phase.step === 'done' && phase.result.status === 'WAITLIST';
  const title =
    phase.step === 'done'
      ? waitlisted
        ? t('detail.booking.waitlistedTitle')
        : t('detail.booking.bookedTitle')
      : instance.title;

  const when = (
    <div {...stylex.props(styles.hero)}>
      <div {...stylex.props(styles.heroTime)}>
        <p {...stylex.props(styles.heroClock)}>{formatZonedTime(instance.startsAt, timeZone)}</p>
        <p {...stylex.props(styles.heroDuration)}>
          {formatZonedTime(instance.endsAt, timeZone)} ·{' '}
          {durationLabel(instance.startsAt, instance.endsAt)}
        </p>
      </div>
      <span aria-hidden {...stylex.props(styles.heroRule)} />
      <div {...stylex.props(styles.heroFacts)}>
        <span {...stylex.props(styles.heroFact)}>
          <Icon name="calendar" {...stylex.props(styles.heroFactIcon)} sw={2.2} />
          {formatZoned(instance.startsAt, timeZone, locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </span>
        {instance.trainerName ? (
          <span {...stylex.props(styles.heroFact)}>
            <Icon name="user" {...stylex.props(styles.heroFactIcon)} sw={2.2} />
            {instance.trainerName}
          </span>
        ) : null}
        {instance.locationName ? (
          <span {...stylex.props(styles.heroFact)}>
            <Icon name="pin" {...stylex.props(styles.heroFactIcon)} sw={2.2} />
            {instance.locationName}
          </span>
        ) : null}
      </div>
    </div>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      // A write in flight must not be dismissable — a modal that vanishes
      // mid-request leaves the member with no idea whether they have a seat.
      dismissible={!pending}
      xstyle={styles.panel}
      description={
        phase.step === 'done' ? undefined : formatZonedDate(instance.startsAt, timeZone, locale)
      }
      actions={
        phase.step === 'done' ? (
          <>
            <ButtonLink
              href="/member/account/bookings"
              variant="ghost"
              size="block"
              label={t('myBookings')}
            />
            <Button variant="primary" size="block" label={t('modal.close')} onClick={onClose} />
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="block"
              label={t('modal.close')}
              onClick={onClose}
              disabled={pending}
            />
            {user ? (
              <Button
                variant="primary"
                size="block"
                loading={pending}
                label={
                  pending
                    ? t('detail.booking.booking')
                    : isFull
                      ? t('detail.booking.joinWaitlist')
                      : t('detail.booking.book')
                }
                onClick={book}
              />
            ) : (
              <ButtonLink
                href={loginHref}
                variant="primary"
                size="block"
                label={t('modal.signInToBook')}
              />
            )}
          </>
        )
      }
    >
      <div {...stylex.props(styles.body)}>
        {phase.step === 'done' ? (
          <>
            <div {...stylex.props(styles.outcome)}>
              <span aria-hidden {...stylex.props(styles.outcomeDisc)}>
                <Icon name="check" {...stylex.props(styles.outcomeIcon)} sw={2.6} />
              </span>
              <p {...stylex.props(styles.outcomeText)}>
                {waitlisted
                  ? t('detail.booking.waitlistedSubtitle')
                  : t('detail.booking.bookedSubtitle')}
                {waitlisted && phase.result.waitlistPosition !== null ? (
                  <Badge
                    tone="pending"
                    label={t('detail.booking.waitlistPosition', {
                      position: phase.result.waitlistPosition,
                    })}
                    xstyle={styles.position}
                  />
                ) : null}
              </p>
            </div>
            {when}
          </>
        ) : (
          <>
            {instance.category ? <Badge tone="neutral" label={instance.category} /> : null}
            {when}

            <Card variant="muted" padding="none" xstyle={styles.capCard}>
              <span {...stylex.props(styles.capLabel)}>{t('modal.capacity')}</span>
              <ClassOccupancy value={instance.bookedCount} cap={instance.capacity} />
              <p {...stylex.props(styles.spots, isFull && styles.spotsFull)}>
                {isFull ? t('detail.booking.fullNote') : t('card.spotsLeft', { count: spotsLeft })}
              </p>
            </Card>

            {/* The failure is stated where the button is, not in a toast at the
                edge of the screen the member is not looking at. */}
            {phase.error ? <Banner tone="error">{phase.error}</Banner> : null}
          </>
        )}
      </div>
    </Dialog>
  );
}

/** A compact duration label between two ISO instants, e.g. "45 min" / "1h 30m". */
function durationLabel(startIso: string, endIso: string): string {
  const minutes = Math.max(
    0,
    Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000),
  );
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Map an API error code to a friendly i18n key (falls back to a generic error). */
function messageKey(code?: string): string {
  switch (code) {
    case 'ALREADY_BOOKED':
      return 'errAlreadyBooked';
    case 'CLASS_NOT_BOOKABLE':
      return 'errNotBookable';
    case 'UNAUTHENTICATED':
      return 'errAuth';
    default:
      return 'errGeneric';
  }
}
