'use client';

import * as stylex from '@stylexjs/stylex';
import { Badge, Button, ButtonLink, Card, Drawer } from '@/src/components/ui/kit';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { ClassInstanceCard } from '@fit/types';
import { usePathname } from '@/src/i18n/navigation';
import { useSession } from '@/hooks/use-session';
import { Icon } from '@/src/components/ui';
import { BookingActionButton } from '@/src/components/member/booking-action-button';
import { ClassOccupancy } from './ClassOccupancy';
import { formatZonedTime } from './date-utils';

// The drawer, on the portal's own kit — shell included.
//
// The sheet used to be `@fit/ui-web`'s `Drawer`, left in place as "the shared
// overlay primitive, out of this screen's migration scope". That exemption is
// what let a Tailwind-authored overlay keep painting inside a screen the
// guardrail counted as migrated: the package is deliberately outside the
// guardrail, so nothing flagged it. The kit's `Drawer` is FormaCore-authored and
// carries its own focus trap, scroll lock and Escape handling.
//
// The old sheet's `accent` stripe (a colour per class category down its edge)
// went with it. The direction allows one chromatic voice and spends it on the
// membership block; a per-category hue is exactly the decorative colour it
// removes. The category is still stated — as a chip, in ink.

const styles = stylex.create({
  headerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.25rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  dl: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    margin: 0,
    fontSize: '0.875rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  dt: {
    margin: 0,
    color: 'var(--color-text-secondary)',
  },
  dd: {
    margin: 0,
    textAlign: 'right',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  mono: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  capCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    padding: '1rem',
  },
  capLabel: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  spots: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  spotsFull: {
    color: 'var(--color-error)',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: '0.5rem',
  },
  fullBtnWrap: {
    display: 'grid',
  },
  fullBtn: {
    width: '100%',
  },
  closeIcon: {
    height: '1.125rem',
    width: '1.125rem',
  },
});

export interface ClassDetailDrawerProps {
  /** The class to show, or `null` when the drawer is closed. */
  instance: ClassInstanceCard | null;
  /** Close the drawer (overlay click, close button, or Esc). */
  onClose: () => void;
  /**
   * The gym's IANA zone. Every time below is read in it rather than in the
   * viewer's — a class is a wall-clock commitment at the gym.
   */
  timeZone: string;
}

/**
 * Right-side sheet showing one class's details and the booking CTA.
 *
 * Built on the shared @fit/ui-web `Drawer` overlay; the body is rebuilt on
 * the portal kit under the FormaCore theme. The CTA is auth-gated: a
 * signed-out visitor gets a link to `/member/login?from=<this page, with the class
 * preselected>` so they return here after signing in; a signed-in member gets
 * the real {@link BookingActionButton}, which runs the booking server action and
 * refreshes the seat counts.
 */
export function ClassDetailDrawer({ instance, onClose, timeZone }: ClassDetailDrawerProps) {
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
  // locale onto `/member/login`, and the login form validates this same-origin path.
  const returnParams = new URLSearchParams(searchParams?.toString() ?? '');
  returnParams.set('class', instance.id);
  const from = `/${locale}${pathname}?${returnParams.toString()}`;
  const loginHref = `/member/login?from=${encodeURIComponent(from)}`;

  return (
    <Drawer open={instance !== null} onClose={onClose} label={instance.title} hideHeader>
      <div {...stylex.props(styles.headerRow)}>
        {instance.category && <Badge tone="neutral" label={instance.category} />}
        <Button
          variant="ghost"
          size="inline"
          iconOnly
          label={t('drawer.close')}
          icon={<Icon name="x" {...stylex.props(styles.closeIcon)} sw={2} />}
          onClick={onClose}
        />
      </div>

      <h2 {...stylex.props(styles.title)}>{instance.title}</h2>

      <dl {...stylex.props(styles.dl)}>
        <DetailRow label={t('drawer.time')}>
          <span {...stylex.props(styles.mono)}>
            {formatZonedTime(instance.startsAt, timeZone)} –{' '}
            {formatZonedTime(instance.endsAt, timeZone)}
          </span>
        </DetailRow>
        {instance.trainerName ? (
          <DetailRow label={t('drawer.trainer')}>{instance.trainerName}</DetailRow>
        ) : null}
        {instance.locationName ? (
          <DetailRow label={t('drawer.location')}>{instance.locationName}</DetailRow>
        ) : null}
      </dl>

      <Card variant="muted" padding="none" xstyle={styles.capCard}>
        <span {...stylex.props(styles.capLabel)}>{t('drawer.capacity')}</span>
        <ClassOccupancy value={instance.bookedCount} cap={instance.capacity} />
        <p {...stylex.props(styles.spots, isFull && styles.spotsFull)}>
          {isFull ? t('card.full') : t('card.spotsLeft', { count: spotsLeft })}
        </p>
      </Card>

      <div {...stylex.props(styles.footer)}>
        {user ? (
          <div {...stylex.props(styles.fullBtnWrap)}>
            <BookingActionButton
              classId={instance.id}
              action="book"
              label={isFull ? t('drawer.full') : t('drawer.book')}
              variant="primary"
              size="page"
              fullWidth
            />
          </div>
        ) : (
          <ButtonLink
            href={loginHref}
            variant="primary"
            size="page"
            fullWidth
            label={t('drawer.signInToBook')}
          />
        )}
      </div>
    </Drawer>
  );
}

/** A labelled detail line in the drawer's definition list. */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div {...stylex.props(styles.row)}>
      <dt {...stylex.props(styles.dt)}>{label}</dt>
      <dd {...stylex.props(styles.dd)}>{children}</dd>
    </div>
  );
}
