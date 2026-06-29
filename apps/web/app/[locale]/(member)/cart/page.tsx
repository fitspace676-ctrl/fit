import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import type { LocationSummary } from '@fit/types';
import { getActiveGymId } from '@/lib/active-gym';
import { fetchCart } from '@/lib/cart';
import { fetchLocations } from '@/lib/locations';
import { CartScreen } from '@/src/components/member/cart/cart-screen';

export const metadata: Metadata = { title: 'Cart — Fit' };
export const dynamic = 'force-dynamic';

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const gymId = await getActiveGymId();
  const [cart, locations] = await Promise.all([
    safe(fetchCart(), {
      items: [],
      subtotal: 0,
      discount: 0,
      total: 0,
      currency: 'GEL',
    }),
    gymId ? safe(fetchLocations({ gymId }), [] as LocationSummary[]) : Promise.resolve([]),
  ]);

  return <CartScreen initialCart={cart} locations={locations} />;
}
