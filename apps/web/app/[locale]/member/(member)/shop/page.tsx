import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { CartView } from '@fit/types';
import { getActiveGymId } from '@/lib/active-gym';
import { fetchCart } from '@/lib/cart';
import { ButtonLink, controlSize, Icon } from '@/src/components/ui';
import { ShopScreen } from '@/src/components/shop/ShopScreen';

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

/** An empty cart — what a signed-out visitor has, and the fallback on failure. */
const NO_CART: CartView = { items: [], subtotal: 0, discount: 0, total: 0, currency: 'GEL' };

// Astryx migration (T11.15): the shop listing header is rebuilt in compiled
// StyleX over the Fit brand theme tokens (`var(--color-*)` / `var(--font-family-*)`)
// — no Tailwind utilities.
//
// FormaCore redesign: the page is now catalogue + cart, so it reads the cart
// server-side and hands it to the client screen as the panel's starting value.
// The listing stays reachable signed-out, which is why the read is allowed to
// fail into an empty cart rather than gate the page.
const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headText: {
    display: 'flex',
    minWidth: 0,
    flexDirection: 'column',
    gap: '0.25rem',
  },
  // Below `lg` the cart panel sits at the foot of the single column, out of
  // sight until you scroll; this is the way to it from the top. At `lg` the
  // panel is permanently on screen beside the catalogue and a second entrance
  // would just be a duplicate of what is already visible.
  cartLink: {
    display: {
      default: 'inline-flex',
      '@media (min-width: 1024px)': 'none',
    },
  },
  cartIcon: {
    height: '1.0625rem',
    width: '1.0625rem',
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

/** Read the cart, treating any failure (including signed-out) as an empty one. */
async function safeCart(): Promise<CartView> {
  try {
    return await fetchCart();
  } catch {
    return NO_CART;
  }
}

/**
 * The gym's shop. A Server Component that resolves the active gym and the
 * member's cart, then hands off to the client {@link ShopScreen}, which owns the
 * catalogue fetch, the product rows and the cart panel beside them. Reachable
 * signed-out (see the web middleware's public paths) — the listing is pure
 * discovery, no auth gate.
 */
export default async function ShopPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tNav, gymId, cart] = await Promise.all([
    getTranslations('shop'),
    getTranslations('member.nav'),
    getActiveGymId(),
    safeCart(),
  ]);

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headText)}>
          <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
          <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
        </div>
        <ButtonLink
          href="/member/cart"
          variant="secondary"
          size="md"
          label={tNav('cart')}
          icon={<Icon name="bag" {...stylex.props(styles.cartIcon)} />}
          xstyle={[controlSize.block, styles.cartLink]}
        />
      </header>

      <ShopScreen gymId={gymId} initialCart={cart} />
    </div>
  );
}
