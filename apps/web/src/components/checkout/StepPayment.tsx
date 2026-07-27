'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import type { CheckoutProductType, PackageInterval, PackageSummary } from '@fit/types';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { createCheckout, fetchSignupCatalogue } from '@/lib/signup';
import { CHECKOUT_LOCATION_KEY } from './StepLocation';
import { CHECKOUT_PACKAGE_KEY, CHECKOUT_PRODUCT_TYPE_KEY, toCards } from './StepPackage';
import { CHECKOUT_CUSTOMER_KEY } from './StepDetails';

/**
 * Online-payment feature flag (T10.8), inlined into the client bundle from
 * `NEXT_PUBLIC_PAYMENTS_ENABLED`. There is no real payment gateway yet — the
 * order response is treated as "captured" (the stub, T8.8) — so this is off by
 * default and the step reserves the membership and points the buyer to the front
 * desk rather than implying an online card charge. A deploy that has wired a real
 * gateway sets the var to "true" to restore the "Pay now" flow. Read statically
 * (not via `@/lib/env`) so the value is inlined by Next at build.
 */
const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';

// Astryx migration (T11.15): step 4 (review + pay) is rebuilt on the Fit brand
// theme — the order summary and status states authored in compiled StyleX
// (`var(--color-*)`), the terms checkbox on the Astryx `CheckboxInput` and
// Back / Pay on the Astryx `Button` — no Tailwind utilities. Package resolution,
// the T10.8 payments flag, order creation (T8.8 stub) and navigation are
// unchanged.
const styles = stylex.create({
  status: {
    paddingBlock: '4rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    paddingBlock: '4rem',
    textAlign: 'center',
  },
  centeredTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  centeredText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  heading: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  notice: {
    margin: 0,
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  summary: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    padding: '1.25rem',
  },
  summaryRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  summaryLabel: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  summaryValue: {
    margin: 0,
    textAlign: 'right',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  totalRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingTop: '0.75rem',
  },
  totalLabel: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  totalValue: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.25rem',
  },
  price: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  priceSuffix: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  error: {
    margin: 0,
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-error)',
    backgroundColor: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-error) 30%, transparent)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  actionsStart: {
    display: 'flex',
    justifyContent: 'flex-start',
  },
});

export interface StepPaymentProps {
  /** Active gym id, or `null` when no tenant is in scope (apex / preview). */
  gymId: string | null;
  /** `?locationId` from step 1 — scopes the catalogue and rides onto the order. */
  locationId?: string;
  /** `?packageId` from step 2 — the product being paid for. */
  packageId?: string;
  /** `?productType` from step 2 — which catalogue `packageId` belongs to. */
  productType?: CheckoutProductType;
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
 *
 * Online payments are gated behind {@link PAYMENTS_ENABLED} (T10.8): until a real
 * gateway is wired the flag is off, so the CTA reads "Reserve my membership" and a
 * notice explains payment is completed at the front desk — the order (still a
 * pending reservation) is created exactly as before, only the copy is honest about
 * no card being charged online. With the flag on the surface reverts to "Pay now".
 */
export function StepPayment({ gymId, locationId, packageId, productType }: StepPaymentProps) {
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

  const effectiveProductType = useMemo((): CheckoutProductType => {
    if (productType) {
      return productType;
    }
    if (typeof window === 'undefined') {
      return 'package';
    }
    const stored = window.sessionStorage.getItem(CHECKOUT_PRODUCT_TYPE_KEY);
    return stored === 'subscription' || stored === 'credit_pack' ? stored : 'package';
  }, [productType]);

  // Resolve the chosen product's summary for the order review. We re-fetch the
  // catalogue and match by id rather than threading the whole object through the
  // URL, then project it the same way step 2's cards do so the review reads
  // identically to the card the buyer picked. Cancel on unmount / dep change.
  useEffect(() => {
    if (!gymId || !effectivePackageId) {
      setLoad({ pkg: null, status: 'ready' });
      return;
    }

    const controller = new AbortController();
    setLoad((prev) => ({ pkg: prev.pkg, status: 'loading' }));

    fetchSignupCatalogue({ gymId, locationId: effectiveLocationId, signal: controller.signal })
      .then((catalogue) => {
        const match =
          toCards(catalogue, effectiveProductType).find((pkg) => pkg.id === effectivePackageId) ??
          null;
        setLoad({ pkg: match, status: 'ready' });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setLoad({ pkg: null, status: 'error' });
      });

    return () => controller.abort();
  }, [gymId, effectivePackageId, effectiveLocationId, effectiveProductType]);

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
      params.set('productType', effectiveProductType);
      if (effectiveLocationId) {
        params.set('locationId', effectiveLocationId);
      }
      return `${pathname}?${params.toString()}`;
    },
    [effectivePackageId, effectiveProductType, effectiveLocationId, pathname],
  );

  const onBack = useCallback(() => {
    router.push(stepHref('3'), { scroll: false });
  }, [router, stepHref]);

  /**
   * Settle the purchase. `POST /checkout` runs as the member — step 3 signed them
   * up (or they were already signed in) — so the request carries only *what* is
   * being bought; the gym, the member and the price come off the session and the
   * catalogue.
   *
   * A subscription enrolment settles onto an invoice rather than an order, so it
   * has no `orderId` to confirm against; the buyer goes to their membership page,
   * which reads the live subscription. Everything else lands on the order
   * confirmation.
   */
  const onPay = useCallback(() => {
    if (!gymId || !effectivePackageId || !termsAccepted || submitting) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    createCheckout({
      productType: effectiveProductType,
      productId: effectivePackageId,
      ...(effectiveLocationId ? { locationId: effectiveLocationId } : {}),
    })
      .then(({ orderId }) => {
        // Clear the wizard's persisted selection so a fresh visit starts clean.
        window.sessionStorage.removeItem(CHECKOUT_PACKAGE_KEY);
        window.sessionStorage.removeItem(CHECKOUT_PRODUCT_TYPE_KEY);
        window.sessionStorage.removeItem(CHECKOUT_LOCATION_KEY);
        window.sessionStorage.removeItem(CHECKOUT_CUSTOMER_KEY);
        // Replace (not push) so Back from the confirmation can't resubmit.
        const target = orderId
          ? `/checkout/success?orderId=${encodeURIComponent(orderId)}`
          : '/account/membership';
        router.replace(target, { scroll: false });
      })
      .catch((error: unknown) => {
        setSubmitting(false);
        setSubmitError(error instanceof Error ? error.message : t('payment.error'));
      });
  }, [
    gymId,
    effectivePackageId,
    effectiveProductType,
    effectiveLocationId,
    termsAccepted,
    submitting,
    router,
    t,
  ]);

  if (load.status === 'loading') {
    return <p {...stylex.props(styles.status)}>{t('payment.loading')}</p>;
  }

  if (load.status === 'error' || !load.pkg) {
    return (
      <div {...stylex.props(styles.root)}>
        <div {...stylex.props(styles.centered)}>
          <p {...stylex.props(styles.centeredTitle)}>{t('payment.unavailable.title')}</p>
          <p {...stylex.props(styles.centeredText)}>{t('payment.unavailable.subtitle')}</p>
        </div>
        <div {...stylex.props(styles.actionsStart)}>
          <Button variant="secondary" size="md" label={t('back')} onClick={onBack} />
        </div>
      </div>
    );
  }

  const pkg = load.pkg;
  const suffix = intervalSuffix(pkg.interval);

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.heading)}>
        <h2 {...stylex.props(styles.title)}>{t('payment.title')}</h2>
        <p {...stylex.props(styles.subtitle)}>{t('payment.subtitle')}</p>
      </div>

      {!PAYMENTS_ENABLED ? <p {...stylex.props(styles.notice)}>{t('payment.notice')}</p> : null}

      <dl {...stylex.props(styles.summary)}>
        <div {...stylex.props(styles.summaryRow)}>
          <dt {...stylex.props(styles.summaryLabel)}>{t('payment.summary.package')}</dt>
          <dd {...stylex.props(styles.summaryValue)}>{pkg.name}</dd>
        </div>
        <div {...stylex.props(styles.totalRow)}>
          <dt {...stylex.props(styles.totalLabel)}>{t('payment.summary.total')}</dt>
          <dd {...stylex.props(styles.totalValue)}>
            <Money locale={locale} amount={pkg.priceAmount} currency={pkg.currency} />
            {suffix ? <span {...stylex.props(styles.priceSuffix)}>{suffix}</span> : null}
          </dd>
        </div>
      </dl>

      <CheckboxInput
        label={t('payment.terms')}
        value={termsAccepted}
        onChange={(checked) => setTermsAccepted(checked)}
        isDisabled={submitting}
      />

      {submitError ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {submitError}
        </p>
      ) : null}

      <div {...stylex.props(styles.actions)}>
        <Button
          variant="secondary"
          size="md"
          label={t('back')}
          isDisabled={submitting}
          onClick={onBack}
        />
        <Button
          variant="primary"
          size="md"
          label={
            submitting
              ? t('payment.processing')
              : PAYMENTS_ENABLED
                ? t('payment.pay')
                : t('payment.reserve')
          }
          isLoading={submitting}
          isDisabled={!termsAccepted || submitting}
          onClick={onPay}
        />
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
  return <span {...stylex.props(styles.price)}>{formatted}</span>;
}
