'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge, Btn, Icon, Progress, QRCode } from '@/src/components/ui';

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
      <div className="relative overflow-hidden rounded-card bg-[linear-gradient(135deg,#5044D2,#7A5AF8)] p-5 text-white shadow-[0_24px_60px_-24px_rgba(80,68,210,0.8)] sm:p-6">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/15 blur-3xl"
        />
        <div className="relative flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-btn bg-white/15">
            <Icon name="bolt" className="h-5 w-5" sw={2.4} />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight">
            {t('membership')}
          </span>
          <span className="ml-auto">
            <Badge tone={active ? 'success' : 'warning'} icon={active ? 'check' : 'clock'}>
              {active ? t('active') : t('noPlan')}
            </Badge>
          </span>
        </div>

        <div className="relative mt-5">
          <p className="font-display text-3xl font-extrabold tracking-tight">
            {planName ?? t('noPlan')}
          </p>
          <p className="mt-1 font-mono text-xs text-white/70">
            {memberName} · {t('memberId')} {memberId}
          </p>
        </div>

        {daysTotal > 0 && (
          <div className="relative mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-white/80">
              <span>{t('daysLeft', { used: daysUsed, total: daysTotal })}</span>
              <span className="font-mono">{pct}%</span>
            </div>
            <Progress value={pct} tone="bg-white" className="bg-white/20" />
          </div>
        )}

        <div className="relative mt-6 flex items-center justify-between gap-3">
          <Btn v="white" icon="qr" onClick={() => setQrOpen(true)}>
            {t('showQr')}
          </Btn>
          <div className="text-right">
            <p className="font-display text-2xl font-extrabold leading-none">{creditsLeft}</p>
            <p className="text-xs text-white/70">{t('ptCredits')}</p>
          </div>
        </div>
      </div>

      {qrOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setQrOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-card border border-white/10 bg-white p-6 text-center dark:bg-ink-900"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-lg font-bold text-ink-900 dark:text-white">
              {t('qrTitle')}
            </p>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t('qrSub')}</p>
            <div className="mt-5 grid place-items-center">
              <QRCode seed={qrSeed} size={224} />
            </div>
            <p className="mt-4 font-mono text-xs text-ink-500 dark:text-ink-400">
              {memberName} · {memberId}
            </p>
            <div className="mt-5">
              <Btn v="primary" className="w-full" onClick={() => setQrOpen(false)}>
                {t('done')}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
