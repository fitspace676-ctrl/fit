import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { checkoutProductTypeSchema, type CheckoutProductType } from '@fit/types';
import { getActiveGymId } from '@/lib/active-gym';
import { StepDetails } from '@/src/components/checkout/StepDetails';
import { StepLocation } from '@/src/components/checkout/StepLocation';
import { StepPackage } from '@/src/components/checkout/StepPackage';
import { StepPayment } from '@/src/components/checkout/StepPayment';
import { WizardShell, type WizardStep } from '@/src/components/checkout/WizardShell';

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

// Astryx migration (T11.15): the purchase-wizard page frame + header are authored
// in compiled StyleX over the Fit brand theme tokens (`var(--color-*)` /
// `var(--font-family-*)`) — no Tailwind utilities. Step routing is unchanged.
const styles = stylex.create({
  page: {
    marginInline: 'auto',
    width: '100%',
    maxWidth: '48rem',
    paddingInline: '1.25rem',
    paddingBlock: '2.5rem',
  },
  header: {
    marginBottom: '2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
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

/** Raw search params the checkout page reads (all optional strings). */
interface CheckoutSearchParams {
  step?: string;
  locationId?: string;
  packageId?: string;
  productType?: string;
}

/**
 * Coerce the `?productType` param to a known catalogue, or `undefined`. The id
 * in `?packageId` is meaningless without it — packages, subscriptions and credit
 * packs are three different tables — so an unrecognised value is dropped rather
 * than guessed at, and the step falls back to what it persisted.
 */
function parseProductType(raw: string | undefined): CheckoutProductType | undefined {
  const parsed = checkoutProductTypeSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** Coerce the `?step` param to a valid 1-based wizard step, defaulting to 1. */
function parseStep(raw: string | undefined): WizardStep {
  const value = Number(raw);
  if (value === 2 || value === 3 || value === 4) {
    return value;
  }
  return 1;
}

/**
 * Public purchase wizard. A Server Component that resolves the active gym and the
 * current step from the URL, then renders the matching step inside the
 * {@link WizardShell} progress chrome. Each step ({@link StepLocation},
 * {@link StepPackage}, {@link StepDetails}, {@link StepPayment}) is a client
 * island that owns its own fetch, selection, and navigation. Reachable
 * signed-out — the auth gate is the final payment step, not the browse.
 */
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<CheckoutSearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const [t, gymId] = await Promise.all([getTranslations('checkout'), getActiveGymId()]);

  const step = parseStep(sp.step);
  const productType = parseProductType(sp.productType);

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
      </header>

      <WizardShell step={step}>
        {step === 1 ? (
          <StepLocation gymId={gymId} initialLocationId={sp.locationId} />
        ) : step === 2 ? (
          <StepPackage
            gymId={gymId}
            locationId={sp.locationId}
            initialPackageId={sp.packageId}
            initialProductType={productType}
          />
        ) : step === 3 ? (
          <StepDetails
            gymId={gymId}
            locationId={sp.locationId}
            packageId={sp.packageId}
            productType={productType}
          />
        ) : (
          <StepPayment
            gymId={gymId}
            locationId={sp.locationId}
            packageId={sp.packageId}
            productType={productType}
          />
        )}
      </WizardShell>
    </div>
  );
}
