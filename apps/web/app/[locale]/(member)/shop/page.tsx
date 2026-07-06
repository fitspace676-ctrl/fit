import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
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

// Astryx migration (T11.15): the shop listing header is rebuilt in compiled
// StyleX over the Fit brand theme tokens (`var(--color-*)` / `var(--font-family-*)`)
// — no Tailwind utilities. The catalogue fetch + card grid live in the client
// `ShopBrowser`, unchanged; only the presentation moved off Tailwind.
const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

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
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
      </header>

      <ShopBrowser gymId={gymId} />
    </div>
  );
}
