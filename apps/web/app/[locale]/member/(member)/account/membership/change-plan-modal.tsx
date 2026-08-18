'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import {
  Badge,
  Banner,
  Button,
  ButtonLink,
  Dialog,
  EmptyState,
  Spinner,
} from '@/src/components/ui/kit';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import type { SignupCatalogueResponse, SubscriptionPlanSummary } from '@fit/types';
import { useRouter } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { CheckoutError, createCheckout, fetchSignupCatalogue } from '@/lib/signup';
import { formatMoney } from '@/lib/shop';

// Changing your plan, where your plan is — not on the checkout page.
//
// The membership screen's primary action used to be a link to `/member/checkout`,
// which is the PUBLIC purchase wizard: four steps — branch, product, who you
// are, pay — built for a stranger who has no account yet. A signed-in member
// arriving there has already answered three of them. They were sent off the
// screen that states their current plan, to a flow that asks them to re-declare
// their identity, to come back to the same screen. The one question they
// actually came to answer — WHICH PLAN — was step two of four.
//
// So the question is asked on its own, in a modal, beside the plan it replaces:
// the plans, the price of each, and one button that names what it will do. The
// checkout page keeps its job (signed-out signup) and is still linked from the
// empty state below, for the gyms that sell things other than memberships.
//
// It is the portal's flow shape, the fourth of them: pick → pending → an outcome
// stated in the panel, failures inline where the button is.
//
// PRICE IS LOCATION-SCOPED, so the branch picker survives — but only when there
// is a branch to pick. `GET /catalogue` prices per location, and the wizard asks
// for the branch FIRST for exactly that reason; dropping it here would quietly
// show one branch's prices to a member who trains at another. A single-branch
// gym has no question to ask and gets no control.

const styles = stylex.create({
  panel: {
    maxWidth: '32rem',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    minHeight: '12rem',
  },
  spinner: {
    height: '1.5rem',
    width: '1.5rem',
    color: 'var(--color-text-secondary)',
  },
  loadingText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  plans: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  // A plan row is a radio in everything but markup: the artboards' inset tile,
  // and the lime ring — not a lime fill — on the chosen one, so the price stays
  // readable and the block colour is still spent only on the action below.
  plan: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.875rem',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--fc-tile-border)',
    backgroundColor: {
      default: 'var(--fc-tile)',
      ':hover': 'var(--fc-tile-hover)',
    },
    paddingInline: '1rem',
    paddingBlock: '0.875rem',
    textAlign: 'left',
    cursor: 'pointer',
    transitionProperty: 'border-color, background-color',
    transitionDuration: '150ms',
  },
  planSelected: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
  },
  // The member's live plan is listed but not offered: switching to the plan you
  // are already on is a charge for nothing.
  planCurrent: {
    cursor: 'default',
    backgroundColor: 'var(--fc-tile)',
  },
  planText: {
    minWidth: 0,
    flex: 1,
  },
  planName: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  planDesc: {
    margin: 0,
    marginTop: '0.125rem',
    fontSize: '0.8125rem',
    lineHeight: 1.4,
    color: 'var(--color-text-secondary)',
  },
  planPrice: {
    margin: 0,
    flexShrink: 0,
    textAlign: 'right',
    fontFamily: 'var(--font-family-code)',
    fontSize: '1rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  planCadence: {
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  /* --------------------------------- branch -------------------------------- */
  // A dropdown for two or three branches hides every option but one behind a
  // click, and a member picking where they train wants to SEE the choices —
  // especially since the price can differ per branch. Chips show them all, and
  // they are the same object the class filters use, seated in the same recessed
  // track. It wraps rather than scrolls, so a gym with six branches still shows
  // six.
  branch: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  branchLabel: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    color: 'var(--color-text-secondary)',
  },
  track: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.125rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.25rem',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    height: '2rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: 0,
    paddingInline: '0.875rem',
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  chipIdle: {
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-overlay-hover)' },
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
  },
  chipActive: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  note: {
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  noteIcon: {
    height: '0.875rem',
    width: '0.875rem',
    flexShrink: 0,
  },
  /* -------------------------------- outcome ------------------------------- */
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
  emptyIcon: {
    height: '2.25rem',
    width: '2.25rem',
    color: 'var(--color-text-secondary)',
  },
});

export interface ChangePlanModalProps {
  open: boolean;
  onClose: () => void;
  /** The tenant whose catalogue to read, resolved from the Host on the server. */
  gymId: string | null;
  /** The member's live plan id, so it is marked rather than offered. */
  currentPlanId: string | null;
  /** Whether the member has a plan at all — switches the verb on the button. */
  hasMembership: boolean;
}

/** How far the flow has got. `error` rides alongside the picker, inline. */
type Flow = { step: 'picking'; error: string | null } | { step: 'done'; title: string };

/**
 * Change (or start) a membership, in place. Reads the gym's catalogue, lists its
 * subscription plans with the live one marked, and buys the chosen one through
 * the same `POST /checkout` the public wizard uses — then states the outcome and
 * refreshes the page so the plan block behind it catches up.
 */
export function ChangePlanModal({
  open,
  onClose,
  gymId,
  currentPlanId,
  hasMembership,
}: ChangePlanModalProps) {
  const t = useTranslations('member.membership');
  const locale = useLocale();
  const router = useRouter();

  const [catalogue, setCatalogue] = useState<SignupCatalogueResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [locationId, setLocationId] = useState<string | undefined>();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [flow, setFlow] = useState<Flow>({ step: 'picking', error: null });
  const [pending, startTransition] = useTransition();
  const branchLabelId = useId();

  // Every open is a fresh flow — otherwise reopening lands on the previous
  // outcome panel.
  useEffect(() => {
    if (open) {
      setFlow({ step: 'picking', error: null });
      setPickedId(null);
    }
  }, [open]);

  // The catalogue is re-read when the branch changes: prices are location-scoped.
  useEffect(() => {
    if (!open || !gymId) {
      if (open && !gymId) setStatus('error');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    fetchSignupCatalogue({ gymId, locationId, signal: controller.signal })
      .then((next) => {
        setCatalogue(next);
        setStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, [open, gymId, locationId]);

  if (!open) {
    return null;
  }

  const plans: SubscriptionPlanSummary[] = catalogue?.subscriptionPlans ?? [];
  const locations = catalogue?.locations ?? [];
  const picked = plans.find((plan) => plan.id === pickedId) ?? null;

  const cadence = (plan: SubscriptionPlanSummary) =>
    plan.interval === 'YEAR' ? t('plan.perYear') : t('plan.perMonth');

  function submit(): void {
    if (!picked) return;
    setFlow({ step: 'picking', error: null });
    startTransition(async () => {
      try {
        await createCheckout({
          productType: 'subscription',
          productId: picked.id,
          ...(locationId ? { locationId } : {}),
        });
        setFlow({
          step: 'done',
          title: hasMembership ? t('plan.changedTitle') : t('plan.startedTitle'),
        });
        router.refresh();
      } catch (err: unknown) {
        // `POST /checkout` has two rejections a member can act on, and both
        // deserve a sentence in their own language rather than the API's
        // English one: they already hold a live membership, or the plan has
        // been withdrawn since the catalogue was read.
        const code = err instanceof CheckoutError ? err.code : undefined;
        setFlow({
          step: 'picking',
          error:
            code === 'ALREADY_SUBSCRIBED'
              ? t('plan.errAlreadySubscribed')
              : code === 'PRODUCT_UNAVAILABLE'
                ? t('plan.errUnavailable')
                : t('plan.error'),
        });
      }
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      // A charge in flight must not be dismissable: a modal that vanishes
      // mid-request leaves the member not knowing which plan they are on.
      dismissible={!pending}
      xstyle={styles.panel}
      title={flow.step === 'done' ? flow.title : hasMembership ? t('changePlan') : t('choosePlan')}
      description={flow.step === 'done' ? undefined : t('plan.subtitle')}
      actions={
        flow.step === 'done' ? (
          <Button variant="primary" size="block" label={t('plan.close')} onClick={onClose} />
        ) : (
          <>
            <Button
              variant="ghost"
              size="block"
              label={t('plan.cancel')}
              onClick={onClose}
              disabled={pending}
            />
            <Button
              variant="primary"
              size="block"
              loading={pending}
              // The button names the plan and carries its price, so the act is
              // stated before it happens without a second confirmation step.
              label={
                pending
                  ? t('plan.working')
                  : picked
                    ? `${hasMembership ? t('plan.confirm', { plan: picked.name }) : t('plan.start', { plan: picked.name })} · ${formatMoney(picked.priceAmount, picked.currency, locale)}`
                    : hasMembership
                      ? t('changePlan')
                      : t('choosePlan')
              }
              disabled={!picked || pending}
              onClick={submit}
            />
          </>
        )
      }
    >
      <div {...stylex.props(styles.body)}>
        {flow.step === 'done' ? (
          <div {...stylex.props(styles.outcome)}>
            <span aria-hidden {...stylex.props(styles.outcomeDisc)}>
              <Icon name="check" {...stylex.props(styles.outcomeIcon)} sw={2.6} />
            </span>
            <p {...stylex.props(styles.outcomeText)}>{t('plan.changedBody')}</p>
          </div>
        ) : status === 'loading' ? (
          <div {...stylex.props(styles.loading)}>
            <Spinner xstyle={styles.spinner} />
            <p {...stylex.props(styles.loadingText)}>{t('plan.loading')}</p>
          </div>
        ) : status === 'error' || plans.length === 0 ? (
          <EmptyState
            icon={<Icon name="ticket" {...stylex.props(styles.emptyIcon)} />}
            title={t('plan.none')}
            body={t('plan.noneHint')}
            action={
              // The wizard is still the way to everything else a gym sells.
              <ButtonLink
                href="/member/checkout"
                variant="secondary"
                size="card"
                label={t('managePlan')}
              />
            }
            compact
          />
        ) : (
          <>
            {locations.length > 1 ? (
              <div {...stylex.props(styles.branch)}>
                <span id={branchLabelId} {...stylex.props(styles.branchLabel)}>
                  {t('plan.location')}
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby={branchLabelId}
                  {...stylex.props(styles.track)}
                >
                  {locations.map((l) => {
                    const active = (locationId ?? locations[0]?.id) === l.id;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={pending}
                        onClick={() => setLocationId(l.id)}
                        {...stylex.props(styles.chip, active ? styles.chipActive : styles.chipIdle)}
                      >
                        {l.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <ul {...stylex.props(styles.plans)}>
              {plans.map((plan) => {
                const isCurrent = plan.id === currentPlanId;
                const isPicked = plan.id === pickedId;
                return (
                  <li key={plan.id}>
                    <button
                      type="button"
                      aria-pressed={isPicked}
                      disabled={isCurrent || pending}
                      onClick={() => setPickedId(plan.id)}
                      {...stylex.props(
                        styles.plan,
                        isPicked && styles.planSelected,
                        isCurrent && styles.planCurrent,
                      )}
                    >
                      <div {...stylex.props(styles.planText)}>
                        <p {...stylex.props(styles.planName)}>{plan.name}</p>
                        {isCurrent ? (
                          <Badge tone="positive" label={t('plan.current')} />
                        ) : plan.description ? (
                          <p {...stylex.props(styles.planDesc)}>{plan.description}</p>
                        ) : null}
                      </div>
                      <p {...stylex.props(styles.planPrice)}>
                        {formatMoney(plan.priceAmount, plan.currency, locale)}
                        <span {...stylex.props(styles.planCadence)}> {cadence(plan)}</span>
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>

            <p {...stylex.props(styles.note)}>
              <Icon name="card" {...stylex.props(styles.noteIcon)} sw={2.2} />
              {t('payAtDesk')}
            </p>

            {/* Stated where the button is, not in a toast at the edge of the
                screen behind the modal. */}
            {flow.error ? <Banner tone="error">{flow.error}</Banner> : null}
          </>
        )}
      </div>
    </Dialog>
  );
}

/**
 * The membership screen's primary action: opens {@link ChangePlanModal} in
 * place. A client island so the rest of the screen stays a Server Component —
 * the trigger has to hold the modal's open state, and nothing else on the page
 * needs to be interactive.
 */
export function ChangePlanButton({
  gymId,
  currentPlanId,
  hasMembership,
}: {
  gymId: string | null;
  currentPlanId: string | null;
  hasMembership: boolean;
}) {
  const t = useTranslations('member.membership');
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="primary"
        size="card"
        label={hasMembership ? t('changePlan') : t('choosePlan')}
        onClick={() => setOpen(true)}
      />
      <ChangePlanModal
        open={open}
        onClose={() => setOpen(false)}
        gymId={gymId}
        currentPlanId={currentPlanId}
        hasMembership={hasMembership}
      />
    </>
  );
}
