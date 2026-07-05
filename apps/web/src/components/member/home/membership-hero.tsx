'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@/src/components/ui';
import { QRCode } from '@/src/components/ui';

export interface MembershipHeroProps {
  planName: string | null;
  active: boolean;
  /** Days elapsed / total in the current billing period (for the progress bar). */
  daysUsed: number;
  daysTotal: number;
  creditsLeft: number;
  memberName: string;
  memberId: string;
  /** Stable seed for the deterministic check-in QR (member id / check-in token). */
  qrSeed: string;
}

// Astryx migration (T11.11): the flagship membership card is rebuilt over the
// Fit brand tokens. The gradient card surface, the check-in QR modal and the
// billing-period bar are authored in compiled StyleX; the status pill and the
// buttons are Astryx `Badge` / `Button`. The gradient reads the brand `--color-
// accent` so it stays on-brand in light + dark; the check-in QR keeps its
// deterministic seed and behaviour unchanged.

const styles = stylex.create({
  card: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 'var(--radius-container)',
    padding: '1.5rem',
    color: '#ffffff',
    backgroundImage:
      'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 92%, #7c3aed), #ec4899)',
    boxShadow: '0 24px 60px -24px color-mix(in srgb, var(--color-accent) 70%, transparent)',
  },
  aura: {
    pointerEvents: 'none',
    position: 'absolute',
    right: '-2.5rem',
    top: '-4rem',
    height: '12rem',
    width: '12rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    filter: 'blur(48px)',
  },
  header: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
  },
  logoTile: {
    display: 'grid',
    placeItems: 'center',
    height: '2.25rem',
    width: '2.25rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  brandWord: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  pill: {
    marginLeft: 'auto',
  },
  planBlock: {
    position: 'relative',
    marginTop: '1.25rem',
  },
  planName: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.875rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  planMeta: {
    margin: 0,
    marginTop: '0.25rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  progressBlock: {
    position: 'relative',
    marginTop: '1.25rem',
  },
  progressHead: {
    marginBottom: '0.375rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  progressPct: {
    fontFamily: 'var(--font-family-code)',
  },
  track: {
    height: '0.5rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  fill: {
    height: '100%',
    borderRadius: 'var(--radius-full)',
    backgroundColor: '#ffffff',
  },
  footer: {
    position: 'relative',
    marginTop: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  qrButton: {
    backgroundColor: '#ffffff',
    color: 'var(--color-text-accent)',
    borderColor: 'transparent',
  },
  creditsBlock: {
    textAlign: 'right',
  },
  creditsValue: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    lineHeight: 1,
  },
  creditsLabel: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    display: 'grid',
    placeItems: 'center',
    padding: '1rem',
    backgroundColor: 'var(--color-overlay)',
    backdropFilter: 'blur(4px)',
  },
  modal: {
    width: '100%',
    maxWidth: '24rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-card)',
    padding: '1.5rem',
    textAlign: 'center',
  },
  modalTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  modalSub: {
    margin: 0,
    marginTop: '0.25rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  qrWrap: {
    marginTop: '1.25rem',
    display: 'grid',
    placeItems: 'center',
  },
  modalMeta: {
    margin: 0,
    marginTop: '1rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  modalAction: {
    marginTop: '1.25rem',
  },
  fullBtn: {
    width: '100%',
  },
  logoIcon: {
    width: '1.25rem',
    height: '1.25rem',
  },
  badgeIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  btnIcon: {
    width: '1rem',
    height: '1rem',
  },
});

/**
 * The dashboard's flagship card: a gradient digital membership card with the
 * plan, billing-period progress, PT-credit count, and a button that opens the
 * member's check-in QR in a modal.
 */
export function MembershipHero({
  planName,
  active,
  daysUsed,
  daysTotal,
  creditsLeft,
  memberName,
  memberId,
  qrSeed,
}: MembershipHeroProps) {
  const t = useTranslations('member.home');
  const [qrOpen, setQrOpen] = useState(false);
  const pct = daysTotal > 0 ? Math.round((daysUsed / daysTotal) * 100) : 0;

  return (
    <>
      <div {...stylex.props(styles.card)}>
        <span aria-hidden {...stylex.props(styles.aura)} />
        <div {...stylex.props(styles.header)}>
          <span {...stylex.props(styles.logoTile)}>
            <Icon name="bolt" sw={2.4} {...stylex.props(styles.logoIcon)} />
          </span>
          <span {...stylex.props(styles.brandWord)}>{t('membership')}</span>
          <span {...stylex.props(styles.pill)}>
            <Badge
              variant={active ? 'success' : 'warning'}
              icon={<Icon name={active ? 'check' : 'clock'} {...stylex.props(styles.badgeIcon)} />}
              label={active ? t('active') : t('noPlan')}
            />
          </span>
        </div>

        <div {...stylex.props(styles.planBlock)}>
          <p {...stylex.props(styles.planName)}>{planName ?? t('noPlan')}</p>
          <p {...stylex.props(styles.planMeta)}>
            {memberName} · {t('memberId')} {memberId}
          </p>
        </div>

        {daysTotal > 0 && (
          <div {...stylex.props(styles.progressBlock)}>
            <div {...stylex.props(styles.progressHead)}>
              <span>{t('daysLeft', { used: daysUsed, total: daysTotal })}</span>
              <span {...stylex.props(styles.progressPct)}>{pct}%</span>
            </div>
            <div {...stylex.props(styles.track)}>
              <div {...stylex.props(styles.fill)} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>
        )}

        <div {...stylex.props(styles.footer)}>
          <Button
            variant="secondary"
            size="md"
            icon={<Icon name="qr" {...stylex.props(styles.btnIcon)} />}
            label={t('showQr')}
            onClick={() => setQrOpen(true)}
            xstyle={styles.qrButton}
          />
          <div {...stylex.props(styles.creditsBlock)}>
            <p {...stylex.props(styles.creditsValue)}>{creditsLeft}</p>
            <p {...stylex.props(styles.creditsLabel)}>{t('ptCredits')}</p>
          </div>
        </div>
      </div>

      {qrOpen && (
        <div
          {...stylex.props(styles.overlay)}
          role="dialog"
          aria-modal="true"
          onClick={() => setQrOpen(false)}
        >
          <div {...stylex.props(styles.modal)} onClick={(e) => e.stopPropagation()}>
            <p {...stylex.props(styles.modalTitle)}>{t('qrTitle')}</p>
            <p {...stylex.props(styles.modalSub)}>{t('qrSub')}</p>
            <div {...stylex.props(styles.qrWrap)}>
              <QRCode seed={qrSeed} size={224} />
            </div>
            <p {...stylex.props(styles.modalMeta)}>
              {memberName} · {memberId}
            </p>
            <div {...stylex.props(styles.modalAction)}>
              <Button
                variant="primary"
                size="md"
                label={t('done')}
                onClick={() => setQrOpen(false)}
                xstyle={styles.fullBtn}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
