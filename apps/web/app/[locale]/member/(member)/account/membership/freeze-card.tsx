'use client';

import { useState, useTransition } from 'react';
import { Banner, Button, Card, Dialog, Meter, NumberField } from '@/src/components/ui/kit';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { MAX_FREEZE_DURATION_DAYS } from '@fit/types';
import { useRouter } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { freezeSubscriptionAction, unfreezeSubscriptionAction } from '@/app/actions/subscriptions';
import { createDateTimeFormat } from '@fit/i18n';

// Astryx migration (T11), now on the portal kit: the "Pause membership" self-service card is rebuilt
// on the portal kit over the FormaCore theme — the header, allowance bar and
// actions use the kit's Card / Button / Meter / NumberField, all layout in
// compiled StyleX (`var(--color-*)`), no Tailwind utilities. The freeze /
// unfreeze server actions are unchanged.
//
// THE MODAL IS THE KIT'S NOW. The duration picker was a private overlay: a fixed
// `<div role="dialog" aria-modal="true">` with a blurred scrim, its own radius,
// border and padding, and an `onClick` on the backdrop. Declaring `aria-modal`
// does not make a modal — nothing trapped focus, nothing locked the scroll
// behind it, and ESCAPE DID NOTHING, so the only way out was to hit the one
// visible Cancel button. `Dialog` brings all of that, and the same silhouette as
// the booking modal.
//
// PAUSING NOW HAS AN OUTCOME, like booking. It used to close the modal and flash
// a toast at the edge of the screen; a member who looked away missed the resume
// date entirely, which is the single fact the whole flow exists to produce. It
// is stated in the panel now, where they were already looking. Failures state
// themselves there too, instead of in a toast beside a modal that has already
// gone.
//
// RESUMING ASKS FIRST. It used to fire on the first click — an irreversible end
// to a freeze, with no confirmation, on the same screen where cancelling a
// single class booking has one.

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
    gap: '0.625rem',
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
    marginTop: '0.125rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  allowance: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  allowanceRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  allowanceRemaining: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
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
  actionRow: {
    display: 'flex',
    justifyContent: 'flex-start',
  },
  /* --------------------------------- modal -------------------------------- */
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  // The one moment the flow earns a graphic — the same lime disc the booking
  // modal uses to say "this happened".
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
});

/** Which act the modal is carrying, and how far it has got. */
type Flow =
  | { kind: 'closed' }
  | { kind: 'freeze'; error: string | null }
  | { kind: 'resume'; error: string | null }
  // `body` differs by act: a pause explains the auto-resume, a resume does not.
  | { kind: 'done'; message: string; body: string | null };

/**
 * The "Pause membership" self-service card (T5.7), on the portal kit:
 * surfaces the plan's freeze allowance and lets the member pause / resume their
 * own membership, wired to the `POST /subscriptions/:id/(un)freeze` endpoints.
 * Both acts run through one modal that states its own outcome; a
 * `422 EXCEEDS_FREEZE_ALLOWANCE` is surfaced inline, carrying the days that
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flow, setFlow] = useState<Flow>({ kind: 'closed' });
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
      ? createDateTimeFormat(locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(new Date(iso))
      : '—';

  function submitFreeze(): void {
    if (!Number.isInteger(days) || days < 1) {
      setFlow({ kind: 'freeze', error: t('errInvalidDuration') });
      return;
    }
    startTransition(async () => {
      const result = await freezeSubscriptionAction(id, {
        startDate: new Date().toISOString(),
        durationDays: days,
      });
      if (result.ok) {
        setFlow({
          kind: 'done',
          message: t('frozenToast', { date: fmtDate(result.data.frozenUntil) }),
          body: t('frozenHint'),
        });
        router.refresh();
      } else if (result.code === 'EXCEEDS_FREEZE_ALLOWANCE') {
        setFlow({
          kind: 'freeze',
          error: t('errAllowance', { days: result.remainingDays ?? freezeDaysRemaining }),
        });
      } else {
        setFlow({ kind: 'freeze', error: t('errGeneric') });
      }
    });
  }

  function submitResume(): void {
    startTransition(async () => {
      const result = await unfreezeSubscriptionAction(id);
      if (result.ok) {
        setFlow({ kind: 'done', message: t('resumedToast'), body: null });
        router.refresh();
      } else {
        setFlow({ kind: 'resume', error: t('errGeneric') });
      }
    });
  }

  const close = () => setFlow({ kind: 'closed' });

  return (
    <Card padding="none">
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
          // Was a hand-tinted panel on `--color-background-blue` / `-border-blue`
          // / `-text-blue` — a hue the FormaCore theme retired and flattens onto
          // plain ink, so the "you are paused" notice rendered as an anonymous
          // grey box. The kit's Banner is the object, and it is already neutral
          // by design rather than by accident.
          <Banner tone="info">
            {t('frozenUntil', { date: fmtDate(frozenUntil) })} — {t('frozenHint')}
          </Banner>
        ) : (
          <div {...stylex.props(styles.allowance)}>
            <div {...stylex.props(styles.allowanceRow)}>
              <span>{t('used', { used: freezeDaysUsed, total: freezeDaysPerPeriod })}</span>
              <span {...stylex.props(styles.allowanceRemaining)}>
                {t('remaining', { days: freezeDaysRemaining })}
              </span>
            </div>
            <Meter value={usedPct} max={100} label={t('title')} showHeader={false} />
          </div>
        )}

        <div {...stylex.props(styles.actionRow)}>
          {isFrozen ? (
            <Button
              variant="secondary"
              size="card"
              icon={<Icon name="spark" {...stylex.props(styles.glyph)} />}
              label={t('resume')}
              onClick={() => setFlow({ kind: 'resume', error: null })}
              disabled={pending}
            />
          ) : freezeDaysPerPeriod === 0 ? (
            <p {...stylex.props(styles.unavailable)}>{t('notAvailable')}</p>
          ) : (
            <Button
              variant="secondary"
              size="card"
              icon={<Icon name="clock" {...stylex.props(styles.glyph)} />}
              label={t('freeze')}
              onClick={() => setFlow({ kind: 'freeze', error: null })}
              disabled={!canFreeze || pending}
              title={canFreeze ? undefined : t('exhausted')}
            />
          )}
        </div>
      </div>

      {flow.kind === 'closed' ? null : (
        <Dialog
          open
          onClose={close}
          // A write in flight must not be dismissable: a modal that vanishes
          // mid-request leaves the member not knowing whether they are paused.
          dismissible={!pending}
          title={
            flow.kind === 'done'
              ? flow.message
              : flow.kind === 'resume'
                ? t('resumeTitle')
                : t('modalTitle')
          }
          description={
            flow.kind === 'freeze' ? t('modalBody', { days: freezeDaysRemaining }) : undefined
          }
          actions={
            flow.kind === 'done' ? (
              <Button variant="primary" size="block" label={t('close')} onClick={close} />
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="block"
                  label={t('cancel')}
                  onClick={close}
                  disabled={pending}
                />
                <Button
                  variant="primary"
                  size="block"
                  loading={pending}
                  label={
                    pending
                      ? t('working')
                      : flow.kind === 'resume'
                        ? t('resume')
                        : t('confirmFreeze')
                  }
                  onClick={flow.kind === 'resume' ? submitResume : submitFreeze}
                />
              </>
            )
          }
        >
          <div {...stylex.props(styles.body)}>
            {flow.kind === 'done' ? (
              <div {...stylex.props(styles.outcome)}>
                <span aria-hidden {...stylex.props(styles.outcomeDisc)}>
                  <Icon name="check" {...stylex.props(styles.outcomeIcon)} sw={2.6} />
                </span>
                {flow.body ? <p {...stylex.props(styles.outcomeText)}>{flow.body}</p> : null}
              </div>
            ) : (
              <>
                {flow.kind === 'freeze' ? (
                  <NumberField
                    label={t('durationLabel')}
                    description={t('durationHint')}
                    value={days}
                    onChange={setDays}
                    min={1}
                    max={maxDays}
                    labels={{
                      decrease: t('durationLess'),
                      increase: t('durationMore'),
                      value: t('durationLabel'),
                    }}
                  />
                ) : (
                  <p {...stylex.props(styles.outcomeText)}>{t('resumeBody')}</p>
                )}

                {/* Stated where the button is, not in a toast beside a modal
                    that has already closed. */}
                {flow.error ? <Banner tone="error">{flow.error}</Banner> : null}
              </>
            )}
          </div>
        </Dialog>
      )}
    </Card>
  );
}
