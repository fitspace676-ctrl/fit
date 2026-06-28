import type { Metadata } from 'next';
import PricingPage from '@/components/marketing/pricing-page';

/**
 * Pricing surface (`formacore.io/pricing`) — the dedicated plan-comparison page
 * the homepage nav and footer point at. Shares the "Aurora Glass" identity and
 * chrome with the marketing homepage; every trial CTA funnels into the
 * owner-signup flow at `/register-gym`.
 */
export const metadata: Metadata = {
  title: 'Pricing - FormaCore',
  description:
    'Simple, transparent pricing for gyms and studios. Every FormaCore plan is the full platform — memberships, scheduling, billing, POS and a branded member app. Priced in GEL with a 14-day free trial.',
};

export default function Page() {
  return <PricingPage />;
}
