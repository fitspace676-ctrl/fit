'use client';

import { useState, useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { MAX_FREEZE_DURATION_DAYS } from '@fit/types';
import { useRouter } from '@/src/i18n/navigation';
import { Icon, useToast } from '@/src/components/ui';
import { freezeSubscriptionAction, unfreezeSubscriptionAction } from '@/app/actions/subscriptions';

// Astryx migration (T11.16): the "Pause membership" self-service card is rebuilt
// on the Astryx design system over the Fit brand theme — the header, allowance
// bar, actions and the freeze-duration modal use Astryx
// Card / Button / ProgressBar / NumberInput, all layout in compiled StyleX
// (`var(--color-*)`), no Tailwind utilities. The freeze / unfreeze server
// actions and toast behaviour are unchanged.

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

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.5rem',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  headTile: {
    display: 'grid',
    placeItems: 'center',
    height: '2.25rem',
    width: '2.25rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  headIcon: {
    height: '1rem',
    width: '1rem',
  },
  headTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  headSub: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  frozen: {
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-blue)',
    backgroundColor: 'var(--color-background-blue)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
  },
  frozenTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-blue)',
  },
  frozenHint: {
    margin: 0,
    marginTop: '0.125rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  allowance: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  allowanceRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  allowanceRemaining: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  unavailable: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-disabled)',
  },
  glyph: {
    height: '1rem',
    width: '1rem',
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
  },
  modalTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  modalBody: {
    margin: 0,
    marginTop: '0.25rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  modalField: {
    marginTop: '1.25rem',
  },
  modalActions: {
    marginTop: '1.5rem',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.5rem',
  },
});

/**
 * The "Pause membership" self-service card (T5.7), on the Astryx design system:
 * surfaces the plan's freeze allowance and lets the member pause / resume their
 * own membership, wired to the `POST /subscriptions/:id/(un)freeze` endpoints. A
 * `422 EXCEEDS_FREEZE_ALLOWANCE` is surfaced as a toast carrying the days that
 * remain. A frozen membership shows its auto-resume date and a "Resume now"
 * action; a plan with no allowance (`freezeDaysPerPeriod === 0`) renders the card
 * read-only.
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
  const [days, setDays] = useState(7);

  const isFrozen = status === 'FROZEN';
  const canFreeze = FREEZABLE.has(status) && freezeDaysRemaining > 0;
  const usedPct =
    freezeDaysPerPeriod > 0
      ? Math.min(100, Math.round((freezeDaysUsed / freezeDaysPerPeriod) * 100))
      : 0;
  const maxDays = Math.min(
    freezeDaysRemaining || MAX_FREEZE_DURATION_DAYS,
    MAX_FREEZE_DURATION_DAYS,
  );

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—';

  function submitFreeze(): void {
    if (!Number.isInteger(days) || days < 1) {
      toast(t('errInvalidDuration'), { tone: 'danger', icon: 'x' });
      return;
    }
    startTransition(async () => {
      const result = await freezeSubscriptionAction(id, {
        startDate: new Date().toISOString(),
        durationDays: days,
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
    <Card variant="default" padding={0}>
      <div {...stylex.props(styles.card)}>
        <div {...stylex.props(styles.header)}>
          <span {...stylex.props(styles.headTile)}>
            <Icon name="clock" {...stylex.props(styles.headIcon)} sw={2.3} />
          </span>
          <div>
            <p {...stylex.props(styles.headTitle)}>{t('title')}</p>
            <p {...stylex.props(styles.headSub)}>{t('subtitle')}</p>
          </div>
        </div>

        {isFrozen ? (
          <div {...stylex.props(styles.frozen)}>
            <p {...stylex.props(styles.frozenTitle)}>
              {t('frozenUntil', { date: fmtDate(frozenUntil) })}
            </p>
            <p {...stylex.props(styles.frozenHint)}>{t('frozenHint')}</p>
          </div>
        ) : (
          <div {...stylex.props(styles.allowance)}>
            <div {...stylex.props(styles.allowanceRow)}>
              <span>{t('used', { used: freezeDaysUsed, total: freezeDaysPerPeriod })}</span>
              <span {...stylex.props(styles.allowanceRemaining)}>
                {t('remaining', { days: freezeDaysRemaining })}
              </span>
            </div>
            <ProgressBar value={usedPct} label={t('title')} isLabelHidden variant="accent" />
          </div>
        )}

        {isFrozen ? (
          <Button
            variant="secondary"
            size="md"
            icon={<Icon name="spark" {...stylex.props(styles.glyph)} />}
            label={pending ? t('working') : t('resume')}
            onClick={resume}
            isDisabled={pending}
          />
        ) : freezeDaysPerPeriod === 0 ? (
          <p {...stylex.props(styles.unavailable)}>{t('notAvailable')}</p>
        ) : (
          <Button
            variant="secondary"
            size="md"
            icon={<Icon name="clock" {...stylex.props(styles.glyph)} />}
            label={t('freeze')}
            onClick={() => setOpen(true)}
            isDisabled={!canFreeze || pending}
            tooltip={canFreeze ? undefined : t('exhausted')}
          />
        )}
      </div>

      {open ? (
        <div
          {...stylex.props(styles.overlay)}
          role="dialog"
          aria-modal="true"
          onClick={() => (pending ? undefined : setOpen(false))}
        >
          <div {...stylex.props(styles.modal)} onClick={(e) => e.stopPropagation()}>
            <p {...stylex.props(styles.modalTitle)}>{t('modalTitle')}</p>
            <p {...stylex.props(styles.modalBody)}>
              {t('modalBody', { days: freezeDaysRemaining })}
            </p>
            <div {...stylex.props(styles.modalField)}>
              <NumberInput
                label={t('durationLabel')}
                description={t('durationHint')}
                value={days}
                onChange={(value) => setDays(value)}
                min={1}
                max={maxDays}
                isIntegerOnly
              />
            </div>
            <div {...stylex.props(styles.modalActions)}>
              <Button
                variant="secondary"
                size="md"
                label={t('cancel')}
                onClick={() => setOpen(false)}
                isDisabled={pending}
              />
              <Button
                variant="primary"
                size="md"
                label={pending ? t('working') : t('confirmFreeze')}
                onClick={submitFreeze}
                isDisabled={pending}
              />
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
