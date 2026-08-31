'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Icon } from '@/src/components/ui';
import { QRCode } from '@/src/components/ui';

export interface CheckInQrProps {
  memberName: string;
  memberId: string;
  /** Stable seed for the deterministic check-in QR (member id / check-in token). */
  qrSeed: string;
  /** Whether the member's plan is live — drives the pill inside the modal. */
  active: boolean;
}

// FormaCore redesign — the check-in QR, split out of `MembershipHero`.
//
// The artboards put this button in the PAGE HEADER, opposite the greeting, not
// inside the membership block. That is a real information-architecture call
// rather than a layout preference: showing your code at the door is the one
// thing a member does on arrival, so it belongs at the top of the page where it
// is reachable without reading anything — while the membership block is left to
// do its own job (what plan am I on, how long is left, what can I change).
//
// Splitting it also freed the block's footer for the two actions the artboards
// actually put there ("manage plan" / "my bookings").

const styles = stylex.create({
  // The page's primary action: solid lime, 48px, the `element` radius.
  trigger: {
    display: 'inline-flex',
    flexShrink: 0,
    height: '3rem',
    alignItems: 'center',
    gap: '0.625rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: 0,
    backgroundColor: { default: 'var(--color-accent)', ':hover': 'var(--fc-accent-hover)' },
    color: 'var(--color-on-accent)',
    paddingInline: '1.5rem',
    fontSize: '0.9375rem',
    fontWeight: 700,
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  triggerIcon: {
    height: '1.125rem',
    width: '1.125rem',
  },

  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    display: 'grid',
    placeItems: 'center',
    padding: '1.5rem',
    backgroundColor: 'var(--color-overlay)',
  },
  modal: {
    width: '100%',
    maxWidth: '420px',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-popover)',
    padding: '1.75rem',
    boxShadow: 'var(--shadow-high)',
  },
  head: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.025em',
    color: 'var(--color-text-primary)',
  },
  sub: {
    margin: 0,
    marginTop: '0.375rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  close: {
    display: 'grid',
    flexShrink: 0,
    placeItems: 'center',
    height: '2.5rem',
    width: '2.5rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: 0,
    backgroundColor: { default: 'var(--fc-ghost)', ':hover': 'var(--fc-tile-hover)' },
    color: 'var(--fc-on-ghost)',
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  closeIcon: {
    height: '1rem',
    width: '1rem',
  },
  // The artboards mount the code on a LIME plaque. It is not decoration: a
  // scanner reads dark-on-light, and the lime gives the QR the brightest,
  // highest-contrast ground the palette has in either theme — the code stays
  // scannable when the surrounding page is charcoal.
  plaque: {
    marginInline: 'auto',
    marginTop: '1.5rem',
    width: '14rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-accent)',
    padding: '1.25rem',
  },
  identity: {
    marginTop: '1.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--fc-tile-border)',
    backgroundColor: 'var(--fc-tile)',
    paddingInline: '1.25rem',
    paddingBlock: '1rem',
  },
  name: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.9375rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  meta: {
    margin: 0,
    marginTop: '0.25rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  metaId: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  statusPill: {
    flexShrink: 0,
    whiteSpace: 'nowrap',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    paddingInline: '0.75rem',
    paddingBlock: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 700,
  },
  done: {
    marginTop: '1.25rem',
    display: 'flex',
    height: '3.25rem',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: 0,
    backgroundColor: { default: 'var(--color-accent)', ':hover': 'var(--fc-accent-hover)' },
    color: 'var(--color-on-accent)',
    fontSize: '0.9375rem',
    fontWeight: 700,
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  doneIcon: {
    height: '1.125rem',
    width: '1.125rem',
  },
});

/**
 * The page-header check-in button and the modal it opens: the member's
 * deterministic QR on a lime plaque, over their name, id and plan status.
 */
export function CheckInQr({ memberName, memberId, qrSeed, active }: CheckInQrProps) {
  const t = useTranslations('member.home');
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} {...stylex.props(styles.trigger)}>
        <Icon name="qr" sw={2.2} {...stylex.props(styles.triggerIcon)} />
        {t('showQr')}
      </button>

      {open && (
        <div
          {...stylex.props(styles.overlay)}
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div {...stylex.props(styles.modal)} onClick={(e) => e.stopPropagation()}>
            <div {...stylex.props(styles.head)}>
              <div>
                <p {...stylex.props(styles.title)}>{t('qrTitle')}</p>
                <p {...stylex.props(styles.sub)}>{t('qrSub')}</p>
              </div>
              <button
                type="button"
                aria-label={t('done')}
                onClick={() => setOpen(false)}
                {...stylex.props(styles.close)}
              >
                <Icon name="x" sw={2.2} {...stylex.props(styles.closeIcon)} />
              </button>
            </div>

            <div {...stylex.props(styles.plaque)}>
              <QRCode seed={qrSeed} size={176} />
            </div>

            <div {...stylex.props(styles.identity)}>
              <div>
                <p {...stylex.props(styles.name)}>{memberName}</p>
                <p {...stylex.props(styles.meta)}>
                  {t('memberId')} <span {...stylex.props(styles.metaId)}>{memberId}</span>
                </p>
              </div>
              {active ? <span {...stylex.props(styles.statusPill)}>{t('active')}</span> : null}
            </div>

            <button type="button" onClick={() => setOpen(false)} {...stylex.props(styles.done)}>
              <Icon name="check" sw={2.4} {...stylex.props(styles.doneIcon)} />
              {t('done')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
