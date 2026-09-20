import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import PricingPage from '@/components/marketing/pricing-page';
import { SHOW_PUBLIC_PRICING } from '@/lib/pricing-visibility';

/**
 * Pricing surface (`formacore.io/pricing`) — the dedicated plan-comparison page
 * the homepage nav and footer point at. Shares the "Aurora Glass" identity and
 * chrome with the marketing homepage; every trial CTA funnels into the
 * owner-signup flow at `/register-gym`.
 *
 * While {@link SHOW_PUBLIC_PRICING} is off the route redirects to the homepage's
 * pricing band (where the "Request pricing" form lives) rather than 404-ing, so
 * any link already out in the world — an old bookmark, a search result, a link in
 * someone's inbox — still lands somewhere useful.
 */
export const metadata: Metadata = SHOW_PUBLIC_PRICING
  ? {
      title: 'Pricing - FormaCore',
      description:
        'Simple, transparent pricing for gyms and studios. Every FormaCore plan is the full platform — memberships, scheduling, billing, POS and a branded member app. Priced in GEL with a 14-day free trial.',
    }
  : {
      title: 'Pricing - FormaCore',
      description:
        'Request pricing for FormaCore — the full platform for gyms and studios: memberships, scheduling, billing, POS and a branded member app.',
      robots: { index: false, follow: true },
    };

export default function Page() {
  if (!SHOW_PUBLIC_PRICING) {
    redirect('/#pricing');
  }
  return <PricingPage />;
}
