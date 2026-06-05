import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getActiveGymId } from '@/lib/active-gym';
import { StepLocation } from '@/src/components/checkout/StepLocation';
import { StepPackage } from '@/src/components/checkout/StepPackage';
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

/** Raw search params the checkout page reads (all optional strings). */
interface CheckoutSearchParams {
  step?: string;
  locationId?: string;
  packageId?: string;
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
 * {@link WizardShell} progress chrome. Steps 1–2 ({@link StepLocation},
 * {@link StepPackage}) are client islands that own their own fetch, selection,
 * and navigation; later steps (T3.10) slot into the same shell. Reachable
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

  return (
    <main className="mx-auto w-full max-w-3xl px-gutter py-10">
      <header className="mb-8 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="text-sm text-slate-500">{t('subtitle')}</p>
      </header>

      <WizardShell step={step}>
        {step === 1 ? (
          <StepLocation gymId={gymId} initialLocationId={sp.locationId} />
        ) : step === 2 ? (
          <StepPackage gymId={gymId} locationId={sp.locationId} initialPackageId={sp.packageId} />
        ) : (
          // Steps 3–4 land in T3.10; until then the shell still renders so the
          // progress indicator and Back navigation behave correctly.
          <p className="py-16 text-center text-sm text-slate-400">{t('comingSoon')}</p>
        )}
      </WizardShell>
    </main>
  );
}
