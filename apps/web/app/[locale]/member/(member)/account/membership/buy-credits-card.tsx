'use client';

import { useState, useTransition } from 'react';
import { Button, Card } from '@/src/components/ui/kit';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { PACK_UNAVAILABLE_CODE, type CreditPackCatalogueEntry } from '@fit/types';
import { useRouter } from '@/src/i18n/navigation';
import { Icon, useToast } from '@/src/components/ui';
import { formatMoney } from '@/lib/shop';
import { purchaseCreditPackAction } from '@/app/actions/credit-packs';

// Astryx migration (T11), now on the portal kit: the "PT credits" metric card + self-service pack
// purchase flow is rebuilt on the portal kit design system over the FormaCore theme —
// the metric, the "Buy more" trigger and the pack picker modal use Astryx
// Card / Button, all layout in compiled StyleX (`var(--color-*)`), no Tailwind
// utilities. The purchase server action and toast behaviour are unchanged.

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
  value: {
    margin: 0,
    marginTop: '0.75rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  buyMore: {
    marginTop: '0.5rem',
    display: 'inline-block',
    borderWidth: 0,
    backgroundColor: 'transparent',
    padding: 0,
    fontSize: '0.75rem',
    fontWeight: 600,
    color: {
      default: 'var(--color-text-accent)',
      ':hover': 'var(--color-accent)',
    },
    textDecorationLine: {
      default: 'none',
      ':hover': 'underline',
    },
    cursor: 'pointer',
  },
  none: {
    margin: 0,
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-disabled)',
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
    maxWidth: '26rem',
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
  packs: {
    marginTop: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  pack: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-card)',
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
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  packMeta: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  modalActions: {
    marginTop: '1.25rem',
    display: 'flex',
    justifyContent: 'flex-end',
  },
});

/**
 * The "PT credits" metric card with a self-service purchase flow (T5.8), on the
 * Astryx design system: shows the member's remaining class credits and — when the
 * gym sells finite-session packs — a "Buy more" button that opens a picker.
 * Choosing a pack posts to `POST /credit-packs/purchase` via the server action,
 * toasts the outcome, and refreshes the page so the new balance shows. A gym with
 * no packs on sale renders the balance read-only (no button), matching the
 * honest-empty-state convention.
 */
export function BuyCreditsCard({ credits, catalogue }: BuyCreditsCardProps) {
  const t = useTranslations('member.membership.credits');
  const locale = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);

  function buy(pack: CreditPackCatalogueEntry): void {
    setBuyingId(pack.id);
    startTransition(async () => {
      const result = await purchaseCreditPackAction(pack.id);
      setBuyingId(null);
      if (result.ok) {
        setOpen(false);
        toast(t('boughtToast', { count: pack.sessionCount }), { tone: 'success', icon: 'check' });
        router.refresh();
      } else if (result.code === PACK_UNAVAILABLE_CODE) {
        toast(t('errUnavailable'), { tone: 'danger', icon: 'x' });
      } else {
        toast(t('errGeneric'), { tone: 'danger', icon: 'x' });
      }
    });
  }

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <Icon name="dumbbell" {...stylex.props(styles.headIcon)} />
        <p {...stylex.props(styles.label)}>{t('title')}</p>
      </div>
      <p {...stylex.props(styles.value)}>{credits}</p>
      {catalogue.length > 0 ? (
        <button type="button" onClick={() => setOpen(true)} {...stylex.props(styles.buyMore)}>
          {t('buyMore')}
        </button>
      ) : (
        <p {...stylex.props(styles.none)}>{t('noneOnSale')}</p>
      )}

      {open ? (
        <div
          {...stylex.props(styles.overlay)}
          role="dialog"
          aria-modal="true"
          onClick={() => (pending ? undefined : setOpen(false))}
        >
          <div {...stylex.props(styles.modal)} onClick={(e) => e.stopPropagation()}>
            <p {...stylex.props(styles.modalTitle)}>{t('modalTitle')}</p>
            <p {...stylex.props(styles.modalBody)}>{t('modalBody')}</p>
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
                    size="inline"
                    label={buyingId === pack.id ? t('buying') : t('buy')}
                    onClick={() => buy(pack)}
                    disabled={pending}
                  />
                </li>
              ))}
            </ul>
            <div {...stylex.props(styles.modalActions)}>
              <Button
                variant="ghost"
                size="inline"
                label={t('close')}
                onClick={() => setOpen(false)}
                disabled={pending}
              />
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
