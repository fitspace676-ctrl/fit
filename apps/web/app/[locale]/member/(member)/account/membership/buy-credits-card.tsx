'use client';

import { useState, useTransition } from 'react';
import { Banner, Button, Card, Dialog } from '@/src/components/ui/kit';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { PACK_UNAVAILABLE_CODE, type CreditPackCatalogueEntry } from '@fit/types';
import { useRouter } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { formatMoney } from '@/lib/shop';
import { purchaseCreditPackAction } from '@/app/actions/credit-packs';

// Astryx migration (T11), now on the portal kit: the "PT credits" metric card + self-service pack
// purchase flow is rebuilt on the portal kit over the FormaCore theme, all
// layout in compiled StyleX (`var(--color-*)`), no Tailwind utilities. The
// purchase server action is unchanged.
//
// THE MODAL IS THE KIT'S NOW. The pack picker was a private overlay — and a
// second, independent copy of the one in `freeze-card.tsx`: the same fixed
// scrim, the same blur, the same panel rules, restated. Neither trapped focus,
// locked the scroll behind it, or answered Escape. `Dialog` does, once, for
// both.
//
// BUYING NOW HAS AN OUTCOME, like booking and pausing. It closed the modal and
// flashed a toast; the panel now says what was bought and where it went, in the
// place the member was already looking.
//
// "Buy more" was a bare underlined text link — the only control on this screen
// that was not a Button. At metric-card scale it read as body copy with a hover
// state, so the one way to spend money here was the least button-like thing on
// the page.

/** Props for the PT-credits card: the live balance and the gym's buyable packs. */
export interface BuyCreditsCardProps {
  credits: number;
  catalogue: CreditPackCatalogueEntry[];
}

const styles = stylex.create({
  card: {
    padding: '1.25rem',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: 'var(--color-text-secondary)',
  },
  headIcon: {
    height: '1.25rem',
    width: '1.25rem',
  },
  label: {
    margin: 0,
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  // Mono, like every other counter in the portal — the dashboard's stat strip,
  // the bookings board's. It was the heading face here alone.
  value: {
    margin: 0,
    marginTop: '0.75rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.75rem',
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '-0.03em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  buyMore: {
    marginTop: '0.875rem',
  },
  none: {
    margin: 0,
    marginTop: '0.75rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-disabled)',
  },
  /* --------------------------------- modal -------------------------------- */
  packs: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  // The artboards' inset tile, so a pack reads as a row seated in the panel
  // rather than as a card floating on another card.
  pack: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--fc-tile-border)',
    backgroundColor: 'var(--fc-tile)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
  },
  packText: {
    minWidth: 0,
  },
  packName: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.9375rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  packMeta: {
    margin: 0,
    marginTop: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  // The same lime disc the booking and pause flows use to say "this happened".
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

/** How far the purchase has got. `error` rides alongside the picker, inline. */
type Flow =
  | { kind: 'closed' }
  | { kind: 'picking'; error: string | null }
  | { kind: 'done'; message: string };

/**
 * The "PT credits" metric card with a self-service purchase flow (T5.8), on the
 * portal kit: shows the member's remaining class credits and — when the gym
 * sells finite-session packs — a "Buy more" button that opens the picker.
 * Choosing a pack posts to `POST /credit-packs/purchase` via the server action,
 * states the outcome in the panel, and refreshes the page so the new balance
 * shows. A gym with no packs on sale renders the balance read-only (no button),
 * matching the honest-empty-state convention.
 */
export function BuyCreditsCard({ credits, catalogue }: BuyCreditsCardProps) {
  const t = useTranslations('member.membership.credits');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flow, setFlow] = useState<Flow>({ kind: 'closed' });
  const [buyingId, setBuyingId] = useState<string | null>(null);

  function buy(pack: CreditPackCatalogueEntry): void {
    setBuyingId(pack.id);
    startTransition(async () => {
      const result = await purchaseCreditPackAction(pack.id);
      setBuyingId(null);
      if (result.ok) {
        setFlow({ kind: 'done', message: t('boughtToast', { count: pack.sessionCount }) });
        router.refresh();
      } else if (result.code === PACK_UNAVAILABLE_CODE) {
        setFlow({ kind: 'picking', error: t('errUnavailable') });
      } else {
        setFlow({ kind: 'picking', error: t('errGeneric') });
      }
    });
  }

  const close = () => setFlow({ kind: 'closed' });

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <Icon name="dumbbell" {...stylex.props(styles.headIcon)} />
        <p {...stylex.props(styles.label)}>{t('title')}</p>
      </div>
      <p {...stylex.props(styles.value)}>{credits}</p>
      {catalogue.length > 0 ? (
        <Button
          variant="secondary"
          size="inline"
          label={t('buyMore')}
          onClick={() => setFlow({ kind: 'picking', error: null })}
          xstyle={styles.buyMore}
        />
      ) : (
        <p {...stylex.props(styles.none)}>{t('noneOnSale')}</p>
      )}

      {flow.kind === 'closed' ? null : (
        <Dialog
          open
          onClose={close}
          dismissible={!pending}
          title={flow.kind === 'done' ? flow.message : t('modalTitle')}
          description={flow.kind === 'done' ? undefined : t('modalBody')}
          actions={
            <Button
              variant={flow.kind === 'done' ? 'primary' : 'ghost'}
              size="block"
              label={t('close')}
              onClick={close}
              disabled={pending}
            />
          }
        >
          <div {...stylex.props(styles.body)}>
            {flow.kind === 'done' ? (
              <div {...stylex.props(styles.outcome)}>
                <span aria-hidden {...stylex.props(styles.outcomeDisc)}>
                  <Icon name="check" {...stylex.props(styles.outcomeIcon)} sw={2.6} />
                </span>
                <p {...stylex.props(styles.outcomeText)}>{t('boughtBody')}</p>
              </div>
            ) : (
              <>
                <ul {...stylex.props(styles.packs)}>
                  {catalogue.map((pack) => (
                    <li key={pack.id} {...stylex.props(styles.pack)}>
                      <div {...stylex.props(styles.packText)}>
                        <p {...stylex.props(styles.packName)}>{pack.name}</p>
                        <p {...stylex.props(styles.packMeta)}>
                          {t('packMeta', {
                            count: pack.sessionCount,
                            price: formatMoney(pack.priceAmount, pack.currency, locale),
                          })}
                        </p>
                      </div>
                      <Button
                        variant="primary"
                        size="card"
                        loading={buyingId === pack.id}
                        label={buyingId === pack.id ? t('buying') : t('buy')}
                        onClick={() => buy(pack)}
                        disabled={pending}
                      />
                    </li>
                  ))}
                </ul>

                {flow.error ? <Banner tone="error">{flow.error}</Banner> : null}
              </>
            )}
          </div>
        </Dialog>
      )}
    </Card>
  );
}
