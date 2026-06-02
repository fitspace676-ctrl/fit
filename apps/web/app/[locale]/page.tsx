import { setRequestLocale } from 'next-intl/server';
import { Hero } from './_components/hero';
import { Features } from './_components/features';
import { Pricing } from './_components/pricing';
import { Footer } from './_components/footer';

/**
 * Public landing page — composes the marketing sections (hero, features,
 * pricing, footer). Each section is a localized server component pulling its
 * copy from `@fit/i18n`. `setRequestLocale` opts the route into static
 * rendering for the resolved locale (matching the layout).
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <Hero />
      <Features />
      <Pricing />
      <Footer />
    </>
  );
}
