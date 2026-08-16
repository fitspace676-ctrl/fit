import type { Metadata } from 'next';
import { getLocale, setRequestLocale } from 'next-intl/server';
import { getActiveGymId } from '@/lib/active-gym';
import { CheckoutScreen } from '@/src/components/checkout/CheckoutScreen';

export const metadata: Metadata = {
  title: 'Checkout — Fit',
  description: 'Choose a location and buy your membership.',
};

/**
 * Render per request, never at build: the active gym is resolved from the
 * request `Host` (`getActiveGymId` → `headers()`), so a prerendered shell would
 * bake in a null gym and show the empty state on every tenant subdomain.
 */
export const dynamic = 'force-dynamic';

/**
 * The public purchase page.
 *
 * A thin server wrapper now: it resolves the tenant and hands off to
 * {@link CheckoutScreen}, which owns the whole flow on one screen. It replaced a
 * server-driven `?step=1..4` wizard that mounted a different client island per
 * step and re-resolved the running summary on every navigation — the selection
 * lives in one component's state instead, so there is nothing to keep in sync
 * between the URL, sessionStorage and the summary.
 *
 * Reachable signed-out: a guest is registered as part of reserving, which is why
 * the screen owns that sequencing rather than a separate step.
 */
export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [activeLocale, gymId] = await Promise.all([getLocale(), getActiveGymId()]);

  return <CheckoutScreen gymId={gymId} locale={activeLocale} />;
}
