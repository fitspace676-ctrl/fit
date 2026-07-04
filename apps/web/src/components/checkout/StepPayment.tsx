'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { PackageInterval, PackageSummary } from '@fit/types';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { fetchPackages } from '@/lib/packages';
import { createOrder } from '@/lib/orders';
import { CHECKOUT_LOCATION_KEY } from './StepLocation';
import { CHECKOUT_PACKAGE_KEY } from './StepPackage';
import { readCheckoutCustomer } from './StepDetails';

export interface StepPaymentProps {
  /** Active gym id, or `null` when no tenant is in scope (apex / preview). */
  gymId: string | null;
  /** `?locationId` from step 1 — scopes the catalogue and rides onto the order. */
  locationId?: string;
  /** `?packageId` from step 2 — the package being paid for. */
  packageId?: string;
}

/** Fetch lifecycle for resolving the chosen package's summary. */
interface LoadState {
  pkg: PackageSummary | null;
  status: 'loading' | 'ready' | 'error';
}

/**
 * Step 4 of the purchase wizard: review and pay. Resolves the package chosen in
 * step 2 (re-fetching the location-scoped catalogue and matching by id) to show
 * an order summary — name, billing interval, total — then gates a "Pay Now"
 * button on an accepted terms-of-service checkbox. On submit it creates a pending
 * order (`POST /orders`, carrying any guest contact details captured in step 3)
 * and, on success, `router.replace`s to the success page keyed by order id — a
 * replace (not push) so the browser Back button from the confirmation can't
 * resubmit the payment. Back returns to step 3 with the package preserved.
 */
export function StepPayment({ gymId, locationId, packageId }: StepPaymentProps) {
  const t = useTranslations('checkout');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const [load, setLoad] = useState<LoadState>({ pkg: null, status: 'loading' });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // The location/package may be missing from the URL on a direct refresh; fall
  // back to what the earlier steps persisted so the summary + order stay intact.
  const effectiveLocationId = useMemo(() => {
    if (locationId) {
      return locationId;
    }
    if (typeof window === 'undefined') {
      return undefined;
    }
    return window.sessionStorage.getItem(CHECKOUT_LOCATION_KEY) ?? undefined;
  }, [locationId]);

  const effectivePackageId = useMemo(() => {
    if (packageId) {
      return packageId;
    }
    if (typeof window === 'undefined') {
      return undefined;
    }
    return window.sessionStorage.getItem(CHECKOUT_PACKAGE_KEY) ?? undefined;
  }, [packageId]);

  // Resolve the chosen package's summary for the order review. We re-fetch the
  // (location-scoped) catalogue and match by id rather than threading the whole
  // object through the URL; cancel on unmount / dependency change.
  useEffect(() => {
    if (!gymId || !effectivePackageId) {
      setLoad({ pkg: null, status: 'ready' });
      return;
    }

    const controller = new AbortController();
    setLoad((prev) => ({ pkg: prev.pkg, status: 'loading' }));

    fetchPackages({ gymId, locationId: effectiveLocationId, signal: controller.signal })
      .then((packages) => {
        const match = packages.find((pkg) => pkg.id === effectivePackageId) ?? null;
        setLoad({ pkg: match, status: 'ready' });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setLoad({ pkg: null, status: 'error' });
      });

    return () => controller.abort();
  }, [gymId, effectivePackageId, effectiveLocationId]);

  const intervalSuffix = useCallback(
    (interval: PackageInterval): string => {
      switch (interval) {
        case 'month':
          return t('packages.perMonth');
        case 'year':
          return t('packages.perYear');
        case 'one_time':
          return '';
      }
    },
    [t],
  );

  const stepHref = useCallback(
    (step: '3') => {
      const params = new URLSearchParams({ step });
      if (effectivePackageId) {
        params.set('packageId', effectivePackageId);
      }
      if (effectiveLocationId) {
        params.set('locationId', effectiveLocationId);
      }
      return `${pathname}?${params.toString()}`;
    },
    [effectivePackageId, effectiveLocationId, pathname],
  );

  const onBack = useCallback(() => {
    router.push(stepHref('3'), { scroll: false });
  }, [router, stepHref]);

  const onPay = useCallback(() => {
    if (!gymId || !effectivePackageId || !termsAccepted || submitting) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const customer = readCheckoutCustomer();
    createOrder({
      gymId,
      packageId: effectivePackageId,
      ...(effectiveLocationId ? { locationId: effectiveLocationId } : {}),
      ...(customer ? { customer } : {}),
    })
      .then(({ orderId }) => {
        // Clear the wizard's persisted selection so a fresh visit starts clean.
        window.sessionStorage.removeItem(CHECKOUT_PACKAGE_KEY);
        window.sessionStorage.removeItem(CHECKOUT_LOCATION_KEY);
        window.sessionStorage.removeItem('checkout_customer');
        // Replace (not push) so Back from the confirmation can't resubmit.
        router.replace(`/checkout/success?orderId=${encodeURIComponent(orderId)}`, {
          scroll: false,
        });
      })
      .catch((error: unknown) => {
        setSubmitting(false);
        setSubmitError(error instanceof Error ? error.message : t('payment.error'));
      });
  }, [gymId, effectivePackageId, effectiveLocationId, termsAccepted, submitting, router, t]);

  if (load.status === 'loading') {
    return (
      <p className="py-16 text-center text-sm text-ink-400 dark:text-ink-500">
        {t('payment.loading')}
      </p>
    );
  }

  if (load.status === 'error' || !load.pkg) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm font-medium text-ink-900 dark:text-white">
            {t('payment.unavailable.title')}
          </p>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            {t('payment.unavailable.subtitle')}
          </p>
        </div>
        <div className="flex justify-start">
          <button
            type="button"
            onClick={onBack}
            className="rounded-card border border-ink-200 dark:border-white/10 px-6 py-2.5 text-sm font-semibold text-ink-700 dark:text-ink-200 transition-colors hover:bg-ink-50 dark:hover:bg-white/5"
          >
            {t('back')}
          </button>
        </div>
      </div>
    );
  }

  const pkg = load.pkg;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-ink-900 dark:text-white">{t('payment.title')}</h2>
        <p className="text-sm text-ink-500 dark:text-ink-400">{t('payment.subtitle')}</p>
      </div>

      <dl className="flex flex-col gap-3 rounded-card border border-ink-200 dark:border-white/10 p-5">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-sm text-ink-500 dark:text-ink-400">{t('payment.summary.package')}</dt>
          <dd className="text-right text-sm font-medium text-ink-900 dark:text-white">
            {pkg.name}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-ink-100 dark:border-white/10 pt-3">
          <dt className="text-sm font-semibold text-ink-900 dark:text-white">
            {t('payment.summary.total')}
          </dt>
          <dd className="flex items-baseline gap-1">
            <Money locale={locale} amount={pkg.priceAmount} currency={pkg.currency} />
            {intervalSuffix(pkg.interval) ? (
              <span className="text-sm text-ink-500 dark:text-ink-400">
                {intervalSuffix(pkg.interval)}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      <label className="flex items-start gap-3 text-sm text-ink-600 dark:text-ink-300">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          disabled={submitting}
          className="mt-0.5 h-4 w-4 rounded border-ink-300 dark:border-white/20 text-brand-600 focus:ring-brand-500"
        />
        <span>{t('payment.terms')}</span>
      </label>

      {submitError ? (
        <p
          role="alert"
          className="rounded-card bg-danger-50 dark:bg-danger-500/10 px-3 py-2 text-sm text-danger-600 dark:text-danger-400"
        >
          {submitError}
        </p>
      ) : null}

      <div className="flex justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="rounded-card border border-ink-200 dark:border-white/10 px-6 py-2.5 text-sm font-semibold text-ink-700 dark:text-ink-200 transition-colors hover:bg-ink-50 dark:hover:bg-white/5 disabled:opacity-60"
        >
          {t('back')}
        </button>
        <button
          type="button"
          onClick={onPay}
          disabled={!termsAccepted || submitting}
          className="rounded-card bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink-200 dark:disabled:bg-white/10 disabled:text-ink-400 dark:disabled:text-ink-500"
        >
          {submitting ? t('payment.processing') : t('payment.pay')}
        </button>
      </div>
    </div>
  );
}

/** Format a minor-unit amount as a currency string against the package's currency. */
function Money({ locale, amount, currency }: { locale: string; amount: number; currency: string }) {
  const formatted = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(amount / 100),
    [locale, amount, currency],
  );
  return (
    <span className="text-2xl font-bold tracking-tight text-ink-900 dark:text-white">
      {formatted}
    </span>
  );
}
