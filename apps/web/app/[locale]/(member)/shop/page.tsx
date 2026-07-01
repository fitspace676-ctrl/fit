import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getActiveGymId } from '@/lib/active-gym';
import { ShopBrowser } from '@/src/components/shop/ShopBrowser';

export const metadata: Metadata = {
  title: 'Shop — Fit',
  description: 'Browse gear, supplements, and essentials from your gym.',
};

/**
 * Render per request, never at build: the active gym is resolved from the
 * request `Host` (`getActiveGymId` → `headers()`), so a prerendered shell would
 * bake in a null gym and show the empty state on every tenant subdomain.
 */
export const dynamic = 'force-dynamic';

/**
 * Public shop listing. A Server Component that resolves the active gym, then
 * hands off to the client {@link ShopBrowser}, which owns the catalogue fetch and
 * the card grid. Reachable signed-out (see the web middleware's public paths) —
 * the listing is pure discovery, no auth gate.
 */
export default async function ShopPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, gymId] = await Promise.all([getTranslations('shop'), getActiveGymId()]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          {t('title')}
        </h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">{t('subtitle')}</p>
      </header>

      <ShopBrowser gymId={gymId} />
    </div>
  );
}
