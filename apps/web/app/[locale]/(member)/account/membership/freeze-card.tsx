'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { MAX_FREEZE_DURATION_DAYS } from '@fit/types';
import { useRouter } from '@/src/i18n/navigation';
import { Btn, Card, Field, Icon, Input, Modal, Progress, useToast } from '@/src/components/ui';
import { freezeSubscriptionAction, unfreezeSubscriptionAction } from '@/app/actions/subscriptions';

/** The membership fields the freeze card renders — a subset of `MemberSubscription`. */
export interface FreezeCardProps {
  id: string;
  status: string;
  frozenUntil: string | null;
  freezeDaysPerPeriod: number;
  freezeDaysUsed: number;
  freezeDaysRemaining: number;
}

/** Statuses a member may freeze from — mirrors the API's freeze state machine. */
const FREEZABLE = new Set(['ACTIVE', 'TRIAL']);

/**
 * The "Pause membership" self-service card (T5.7): surfaces the plan's freeze
 * allowance and lets the member pause / resume their own membership, wired to the
 * `POST /subscriptions/:id/(un)freeze` endpoints. A `422 EXCEEDS_FREEZE_ALLOWANCE`
 * is surfaced as a toast carrying the days that remain. A frozen membership shows
 * its auto-resume date and a "Resume now" action; a plan with no allowance
 * (`freezeDaysPerPeriod === 0`) renders the card read-only.
 */
export function FreezeCard({
  id,
  status,
  frozenUntil,
  freezeDaysPerPeriod,
  freezeDaysUsed,
  freezeDaysRemaining,
}: FreezeCardProps) {
  const t = useTranslations('member.membership.freeze');
  const locale = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState('7');

  const isFrozen = status === 'FROZEN';
  const canFreeze = FREEZABLE.has(status) && freezeDaysRemaining > 0;
  const usedPct =
    freezeDaysPerPeriod > 0
      ? Math.min(100, Math.round((freezeDaysUsed / freezeDaysPerPeriod) * 100))
      : 0;

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—';

  function submitFreeze(): void {
    const durationDays = Number(days);
    if (!Number.isInteger(durationDays) || durationDays < 1) {
      toast(t('errInvalidDuration'), { tone: 'danger', icon: 'x' });
      return;
    }
    startTransition(async () => {
      const result = await freezeSubscriptionAction(id, {
        startDate: new Date().toISOString(),
        durationDays,
      });
      if (result.ok) {
        setOpen(false);
        toast(t('frozenToast', { date: fmtDate(result.data.frozenUntil) }), {
          tone: 'success',
          icon: 'check',
        });
        router.refresh();
      } else if (result.code === 'EXCEEDS_FREEZE_ALLOWANCE') {
        toast(t('errAllowance', { days: result.remainingDays ?? freezeDaysRemaining }), {
          tone: 'danger',
          icon: 'x',
        });
      } else {
        toast(t('errGeneric'), { tone: 'danger', icon: 'x' });
      }
    });
  }

  function resume(): void {
    startTransition(async () => {
      const result = await unfreezeSubscriptionAction(id);
      if (result.ok) {
        toast(t('resumedToast'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(t('errGeneric'), { tone: 'danger', icon: 'x' });
      }
    });
  }

  return (
    <Card glow className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Icon name="clock" className="h-4 w-4" sw={2.3} />
        </span>
        <div>
          <p className="font-display text-base font-bold text-ink-900 dark:text-white">
            {t('title')}
          </p>
          <p className="text-xs text-ink-500 dark:text-ink-400">{t('subtitle')}</p>
        </div>
      </div>

      {isFrozen ? (
        <div className="rounded-card border border-iris-300/60 bg-iris-50 px-4 py-3 text-sm dark:border-iris-400/30 dark:bg-iris-500/10">
          <p className="font-semibold text-iris-800 dark:text-iris-200">
            {t('frozenUntil', { date: fmtDate(frozenUntil) })}
          </p>
          <p className="mt-0.5 text-iris-700/80 dark:text-iris-200/70">{t('frozenHint')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-ink-500 dark:text-ink-400">
            <span>{t('used', { used: freezeDaysUsed, total: freezeDaysPerPeriod })}</span>
            <span className="font-mono tabular-nums">
              {t('remaining', { days: freezeDaysRemaining })}
            </span>
          </div>
          <Progress value={usedPct} />
        </div>
      )}

      {isFrozen ? (
        <Btn v="outline" size="md" icon="spark" onClick={resume} disabled={pending}>
          {pending ? t('working') : t('resume')}
        </Btn>
      ) : freezeDaysPerPeriod === 0 ? (
        <p className="text-sm text-ink-400">{t('notAvailable')}</p>
      ) : (
        <Btn
          v="outline"
          size="md"
          icon="clock"
          onClick={() => setOpen(true)}
          disabled={!canFreeze || pending}
          title={canFreeze ? undefined : t('exhausted')}
        >
          {t('freeze')}
        </Btn>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('modalTitle')}
        description={t('modalBody', { days: freezeDaysRemaining })}
        size="sm"
        footer={
          <>
            <Btn v="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t('cancel')}
            </Btn>
            <Btn v="primary" onClick={submitFreeze} disabled={pending}>
              {pending ? t('working') : t('confirmFreeze')}
            </Btn>
          </>
        }
      >
        <Field label={t('durationLabel')} hint={t('durationHint')}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.min(
              freezeDaysRemaining || MAX_FREEZE_DURATION_DAYS,
              MAX_FREEZE_DURATION_DAYS,
            )}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </Field>
      </Modal>
    </Card>
  );
}
