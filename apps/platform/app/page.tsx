import { CtaBanner } from '@/components/marketing/cta-banner';
import { Features } from '@/components/marketing/features';
import { Hero } from '@/components/marketing/hero';
import { Pricing } from '@/components/marketing/pricing';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteHeader } from '@/components/marketing/site-header';

/**
 * Marketing homepage — the apex (`fit.ge`) acquisition surface. Header → hero →
 * features → pricing → closing CTA → footer, every call to action funnelling
 * into the owner-signup flow at `/register-gym`. Fully static / server-rendered;
 * only the signup form on `/register-gym` ships client JS.
 */
export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Features />
        <Pricing />
        <CtaBanner />
      </main>
      <SiteFooter />
    </>
  );
}
