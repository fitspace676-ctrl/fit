import { localeUrl, SITE_URL } from '@/src/i18n/metadata';

/**
 * Structured data (schema.org JSON-LD) for search engines: who FormaCore is,
 * what the product is and costs, where a page sits in the site. Rendered on the
 * server as a plain <script>, so it is in the HTML crawlers read.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // `<` is escaped so a value can never close the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

const ORG_ID = `${SITE_URL}/#organization`;

export function organizationLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: 'FormaCore',
    url: SITE_URL,
    logo: `${SITE_URL}/apple-icon.png`,
    email: 'info@formacore.io',
    sameAs: [
      'https://www.facebook.com/FormaCore',
      'https://www.instagram.com/forma_core_/',
      'https://www.linkedin.com/company/formacorefitness',
    ],
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Zaza Panaskerteli-Tsitsishvili St. 1, apt. 180',
      addressLocality: 'Tbilisi',
      addressCountry: 'GE',
    },
  };
}

export function websiteLd(locale: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'FormaCore',
    url: localeUrl(locale, '/'),
    inLanguage: locale === 'ka' ? 'ka' : 'en',
    publisher: { '@id': ORG_ID },
  };
}

/** The monthly plan prices, in GEL, as on the pricing cards (`TIER_META`). */
export function softwareApplicationLd(
  locale: string,
  description: string,
  plans: readonly { name: string; monthly: number }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'FormaCore',
    description,
    url: localeUrl(locale, '/'),
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Gym management software',
    operatingSystem: 'Web, iOS, Android',
    publisher: { '@id': ORG_ID },
    offers: plans.map((plan) => ({
      '@type': 'Offer',
      name: plan.name,
      price: plan.monthly,
      priceCurrency: 'GEL',
      url: localeUrl(locale, '/pricing'),
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: plan.monthly,
        priceCurrency: 'GEL',
        unitCode: 'MON',
      },
    })),
  };
}

export function breadcrumbLd(
  locale: string,
  trail: readonly { name: string; path: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: step.name,
      item: localeUrl(locale, step.path),
    })),
  };
}
