'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { PACK_UNAVAILABLE_CODE, type CreditPackCatalogueEntry } from '@fit/types';
import { useRouter } from '@/src/i18n/navigation';
import { Btn, Card, Icon, Modal, useToast } from '@/src/components/ui';
import { formatMoney } from '@/lib/shop';
import { purchaseCreditPackAction } from '@/app/actions/credit-packs';

/** Props for the PT-credits card: the live balance and the gym's buyable packs. */
export interface BuyCreditsCardProps {
  credits: number;
  catalogue: CreditPackCatalogueEntry[];
}

/**
 * The "PT credits" metric card with a self-service purchase flow (T5.8): shows the
 * member's remaining class credits and — when the gym sells finite-session packs —
 * a "Buy more" button that opens a picker. Choosing a pack posts to
 * `POST /credit-packs/purchase` via the server action, toasts the outcome, and
 * refreshes the page so the new balance shows. A gym with no packs on sale renders
 * the balance read-only (no button), matching the honest-empty-state convention.
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
    <Card className="p-5">
      <div className="flex items-center gap-2 text-ink-500 dark:text-ink-400">
        <Icon name="dumbbell" className="h-5 w-5" />
        <p className="text-xs font-semibold uppercase tracking-wide">{t('title')}</p>
      </div>
      <p className="mt-3 font-display text-2xl font-extrabold tabular-nums text-ink-900 dark:text-white">
        {credits}
      </p>
      {catalogue.length > 0 ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
        >
          {t('buyMore')}
        </button>
      ) : (
        <p className="mt-2 text-xs text-ink-400">{t('noneOnSale')}</p>
      )}

      <Modal
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title={t('modalTitle')}
        description={t('modalBody')}
        size="sm"
      >
        <ul className="flex flex-col gap-2">
          {catalogue.map((pack) => (
            <li
              key={pack.id}
              className="flex items-center justify-between gap-3 rounded-card border border-ink-100 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.035]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900 dark:text-white">
                  {pack.name}
                </p>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  {t('packMeta', {
                    count: pack.sessionCount,
                    price: formatMoney(pack.priceAmount, pack.currency, locale),
                  })}
                </p>
              </div>
              <Btn v="primary" size="sm" onClick={() => buy(pack)} disabled={pending}>
                {buyingId === pack.id ? t('buying') : t('buy')}
              </Btn>
            </li>
          ))}
        </ul>
      </Modal>
    </Card>
  );
}
