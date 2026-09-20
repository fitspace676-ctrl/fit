import type { Metadata } from 'next';
import PricingPage from '@/components/marketing/pricing-page';
import { SHOW_PUBLIC_PRICING } from '@/lib/pricing-visibility';

/**
 * Pricing surface (`formacore.io/pricing`) — the dedicated plan-comparison page
 * the homepage nav and footer point at. Shares the "Aurora Glass" identity and
 * chrome with the marketing homepage; every trial CTA funnels into the
 * owner-signup flow at `/register-gym`.
 *
 * The page is the same whether or not {@link SHOW_PUBLIC_PRICING} is on: plans,
 * badges and the full feature comparison. Only the figures depend on the flag —
 * with it off each card offers a "Request pricing" quote form instead.
 */
export const metadata: Metadata = {
  title: 'Pricing - FormaCore',
  description: SHOW_PUBLIC_PRICING
    ? 'Simple, transparent pricing for gyms and studios. Every FormaCore plan is the full platform — memberships, scheduling, billing, POS and a branded member app. Priced in GEL with a 14-day free trial.'
    : 'Compare FormaCore plans for gyms and studios — memberships, scheduling, billing, POS and a branded member app. Request a quote for your business.',
};

export default function Page() {
  return <PricingPage />;
}
